"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { z } from "zod";
import { callSourceAct } from "@/lib/act";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { getAuthProvider, USER_COOKIE } from "@/lib/auth-identity";
import { findActionableItem, getInboxDetail, type InboxDetail } from "@/lib/store";

/** Tài khoản AD: chữ, số, ".", "_", "-" */
const ACCOUNT_PATTERN = /^[a-z0-9._-]{1,100}$/;

/** Đổi ngôn ngữ giao diện — lưu ở cookie của trình duyệt (1 năm) */
export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

/** Chỉ môi trường dev: chọn tài khoản thử (ở SSO / IIS / đăng nhập thử danh tính do hệ thống xác định, không đổi được) */
export async function switchUserAction(account: string) {
  if (getAuthProvider() !== "dev") return;
  const value = account.trim().toLowerCase();
  if (!ACCOUNT_PATTERN.test(value)) return;
  (await cookies()).set(USER_COOKIE, value, { path: "/", sameSite: "lax" });
  revalidatePath("/", "layout");
}

/** Giới hạn độ dài ý kiến / lý do (khớp giới hạn ở hệ thống nguồn) */
const COMMENT_MAX = 500;

const actSchema = z.object({ id: z.number().int().positive(), action: z.enum(["approve", "return"]), comment: z.string().max(COMMENT_MAX) });

export type ActActionResult = { ok: true; message: string; approved: boolean } | { ok: false; error: string };

/**
 * Xác nhận / phê duyệt / trả lại một việc ngay trên hộp việc: gọi API của hệ thống nguồn kèm tài khoản domain của người đang đăng nhập
 * (lấy ở server, không nhận từ trình duyệt). Quyền do hệ thống nguồn kiểm tra; ở đây chỉ nhận việc ĐÚNG là của người này.
 */
export async function actOnItemAction(id: number, action: "approve" | "return", comment: string): Promise<ActActionResult> {
  const t = await getTranslations("inbox.act");
  const input = actSchema.safeParse({ id, action, comment: comment.trim() });
  if (!input.success) return { ok: false, error: t("invalid") };
  if (input.data.action === "return" && !input.data.comment) return { ok: false, error: t("reasonRequired") };

  const user = await getCurrentUser();
  const found = await findActionableItem(user.account, input.data.id);
  const audit = { action: `item.${input.data.action}`, actor: `user:${user.account}`, method: "ACTION", path: "/viec-can-xu-ly" };
  if (!found) {
    await recordAudit({ ...audit, result: "DENIED", status: 409, errorCode: "not_actionable" });
    revalidatePath("/viec-can-xu-ly");
    return { ok: false, error: t("notActionable") };
  }

  const { item, system } = found;
  const outcome = await callSourceAct(system, { sourceId: item.sourceId, stepNo: item.stepNo, action: input.data.action, comment: input.data.comment, account: user.account });
  await recordAudit({
    ...audit,
    result: outcome.ok ? "OK" : outcome.status === 401 || outcome.status === 403 ? "DENIED" : "ERROR",
    status: outcome.ok ? 200 : outcome.status,
    system: system.key,
    sourceId: item.sourceId,
    stepNo: String(item.stepNo),
    ...(outcome.ok ? {} : { errorCode: outcome.status === 0 ? "unreachable" : "rejected" }),
  });
  // Hệ thống nguồn đã đẩy trạng thái mới sang hộp việc (hoặc việc đã đổi): làm mới danh sách
  revalidatePath("/viec-can-xu-ly");
  if (outcome.ok) return { ok: true, message: outcome.message || t("done"), approved: outcome.approved };
  if (outcome.status === 0) return { ok: false, error: t("unreachable") };
  return { ok: false, error: outcome.message || t("failed") };
}

/** Tuyến phê duyệt + các dòng hàng của đề nghị chứa việc này (để hiện trong hộp thoại xem) */
export async function getDetailAction(id: number): Promise<InboxDetail> {
  if (!Number.isInteger(id) || id <= 0) return { route: [], lines: [] };
  const user = await getCurrentUser();
  return getInboxDetail(user.account, id);
}
