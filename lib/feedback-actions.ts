"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { createFeedback, FEEDBACK_DAILY_LIMIT, FEEDBACK_MAX, feedbackLength, isFeedbackAdmin, updateFeedbackStatus } from "@/lib/feedback";
import { FEEDBACK_STATUSES } from "@/db/schema";

const SEND_PATH = "/gop-y";
const VIEW_PATH = "/gop-y/xem";

export type FeedbackActionResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Gửi góp ý. Người gửi lấy ở server (getCurrentUser), không nhận từ trình duyệt.
 * Nhật ký không ghi nội dung góp ý.
 */
export async function sendFeedbackAction(content: string): Promise<FeedbackActionResult> {
  const t = await getTranslations("feedback.form");
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) return { ok: false, error: t("errorEmpty") };
  if (feedbackLength(text) > FEEDBACK_MAX) return { ok: false, error: t("errorTooLong", { max: FEEDBACK_MAX }) };

  const user = await getCurrentUser();
  const audit = { action: "feedback.create", actor: `user:${user.account}`, method: "ACTION", path: SEND_PATH };
  try {
    const result = await createFeedback(user.account, text);
    if (!result.ok) {
      await recordAudit({ ...audit, result: "DENIED", status: 429, errorCode: "rate_limited" });
      return { ok: false, error: t("errorRateLimited", { limit: FEEDBACK_DAILY_LIMIT }) };
    }
    await recordAudit({ ...audit, result: "OK", status: 200, detail: { id: result.id } });
    return { ok: true, message: t("sent") };
  } catch (e) {
    console.error("[feedback] Không lưu được góp ý", e);
    await recordAudit({ ...audit, result: "ERROR", status: 500, errorCode: "internal_error" });
    return { ok: false, error: t("errorGeneric") };
  }
}

const statusSchema = z.object({ id: z.number().int().positive(), status: z.enum(FEEDBACK_STATUSES) });

/** Đổi trạng thái góp ý — chỉ dev-admin (kiểm tra lại ở đây, không tin giao diện) */
export async function updateFeedbackStatusAction(id: number, status: string): Promise<FeedbackActionResult> {
  const t = await getTranslations("feedback.view");
  const user = await getCurrentUser();
  const audit = { action: "feedback.update_status", actor: `user:${user.account}`, method: "ACTION", path: VIEW_PATH };
  if (!isFeedbackAdmin(user.account)) {
    await recordAudit({ ...audit, result: "DENIED", status: 404, errorCode: "not_admin" });
    return { ok: false, error: t("errorGeneric") };
  }
  const input = statusSchema.safeParse({ id, status });
  if (!input.success) return { ok: false, error: t("errorGeneric") };

  try {
    const found = await updateFeedbackStatus(input.data.id, input.data.status, user.account);
    if (!found) {
      await recordAudit({ ...audit, result: "ERROR", status: 404, errorCode: "not_found", detail: { id: input.data.id } });
      return { ok: false, error: t("errorNotFound") };
    }
    await recordAudit({ ...audit, result: "OK", status: 200, detail: { id: input.data.id, status: input.data.status } });
    revalidatePath(VIEW_PATH);
    return { ok: true, message: t("statusUpdated") };
  } catch (e) {
    console.error("[feedback] Không cập nhật được trạng thái", e);
    await recordAudit({ ...audit, result: "ERROR", status: 500, errorCode: "internal_error", detail: { id: input.data.id } });
    return { ok: false, error: t("errorGeneric") };
  }
}
