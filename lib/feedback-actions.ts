"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { displayAccount } from "@/lib/auth-identity";
import { createFeedback, FEEDBACK_DAILY_LIMIT, FEEDBACK_FILTERS, FEEDBACK_MAX, feedbackLength, isFeedbackAdmin, listFeedback, listMyFeedback, updateFeedbackStatus } from "@/lib/feedback";
import { FEEDBACK_STATUSES } from "@/db/schema";

/** Đường dẫn ghi vào nhật ký: hộp thoại góp ý không có trang riêng, dùng một mã chung */
const SEND_PATH = "/gop-y";

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

/** Số góp ý mỗi trang trong hộp thoại (Góp ý của tôi / Xem góp ý) */
const MODAL_PAGE_SIZE = 3;

export type MyFeedbackPage =
  | { ok: true; rows: { id: number; content: string; createdAt: string }[]; page: number; pageCount: number; total: number }
  | { ok: false; error: string };

/** Góp ý của chính người đăng nhập (lấy ở server, không nhận tài khoản từ trình duyệt), phân trang */
export async function listMyFeedbackAction(page: number): Promise<MyFeedbackPage> {
  const t = await getTranslations("feedback.mine");
  const user = await getCurrentUser();
  const wanted = Number.isInteger(page) && page > 0 ? page : 1;
  try {
    const { rows, pageInfo } = await listMyFeedback(user.account, { page: wanted, size: MODAL_PAGE_SIZE });
    return {
      ok: true,
      rows: rows.map((r) => ({ id: r.id, content: r.content, createdAt: r.createdAt.toISOString() })),
      page: pageInfo.page,
      pageCount: pageInfo.pageCount,
      total: pageInfo.total,
    };
  } catch (e) {
    console.error("[feedback] Không tải được góp ý của tôi", e);
    return { ok: false, error: t("errorLoad") };
  }
}

export type AllFeedbackPage =
  | {
      ok: true;
      rows: { id: number; content: string; createdAt: string; sender: string; status: string; handledBy: string | null; handledAt: string | null }[];
      page: number;
      pageCount: number;
      total: number;
    }
  | { ok: false; error: string };

/** Tất cả góp ý (lọc theo trạng thái, phân trang) — chỉ dev-admin; kiểm tra quyền ở đây, không tin giao diện */
export async function listAllFeedbackAction(filter: string, page: number): Promise<AllFeedbackPage> {
  const t = await getTranslations("feedback.view");
  const user = await getCurrentUser();
  if (!isFeedbackAdmin(user.account)) {
    await recordAudit({ action: "feedback.list", actor: `user:${user.account}`, method: "ACTION", path: SEND_PATH, result: "DENIED", status: 404, errorCode: "not_admin" });
    return { ok: false, error: t("errorLoad") };
  }
  const wantedFilter = FEEDBACK_FILTERS.find((f) => f === filter) ?? "all";
  const wantedPage = Number.isInteger(page) && page > 0 ? page : 1;
  try {
    const { rows, pageInfo } = await listFeedback(wantedFilter, { page: wantedPage, size: MODAL_PAGE_SIZE });
    return {
      ok: true,
      rows: rows.map((r) => ({
        id: r.id,
        content: r.content,
        createdAt: r.createdAt.toISOString(),
        sender: displayAccount(r.senderAccount),
        status: r.status,
        handledBy: r.handledBy ? displayAccount(r.handledBy) : null,
        handledAt: r.handledAt ? r.handledAt.toISOString() : null,
      })),
      page: pageInfo.page,
      pageCount: pageInfo.pageCount,
      total: pageInfo.total,
    };
  } catch (e) {
    console.error("[feedback] Không tải được danh sách góp ý", e);
    return { ok: false, error: t("errorLoad") };
  }
}

const statusSchema = z.object({ id: z.number().int().positive(), status: z.enum(FEEDBACK_STATUSES) });

/** Đổi trạng thái góp ý — chỉ dev-admin (kiểm tra lại ở đây, không tin giao diện) */
export async function updateFeedbackStatusAction(id: number, status: string): Promise<FeedbackActionResult> {
  const t = await getTranslations("feedback.view");
  const user = await getCurrentUser();
  const audit = { action: "feedback.update_status", actor: `user:${user.account}`, method: "ACTION", path: SEND_PATH };
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
    return { ok: true, message: t("statusUpdated") };
  } catch (e) {
    console.error("[feedback] Không cập nhật được trạng thái", e);
    await recordAudit({ ...audit, result: "ERROR", status: 500, errorCode: "internal_error", detail: { id: input.data.id } });
    return { ok: false, error: t("errorGeneric") };
  }
}
