import "server-only";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { feedback, FEEDBACK_STATUSES, type FeedbackRow, type FeedbackStatus } from "@/db/schema";
import { db } from "@/lib/db";
import { pageInfo, type TableQuery } from "@/lib/table";

/** Độ dài nội dung góp ý (tính theo ký tự Unicode, khớp CHECK char_length trong DB) */
export const FEEDBACK_MAX = 5000;
/** Chống spam: số góp ý tối đa của một tài khoản trong khoảng FEEDBACK_WINDOW_MS */
export const FEEDBACK_DAILY_LIMIT = 10;
const FEEDBACK_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Bộ lọc trạng thái ở màn Xem góp ý: "all" hoặc một trạng thái */
export type FeedbackFilter = FeedbackStatus | "all";
export const FEEDBACK_FILTERS: readonly FeedbackFilter[] = ["all", ...FEEDBACK_STATUSES];

/** Dev-admin của hòm thư góp ý: tài khoản AD (không kèm domain) trong FEEDBACK_ADMINS, cách nhau bằng dấu phẩy; trống = không ai */
export function isFeedbackAdmin(account: string): boolean {
  const admins = (process.env.FEEDBACK_ADMINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(account.trim().toLowerCase());
}

export const isFeedbackStatus = (v: unknown): v is FeedbackStatus => FEEDBACK_STATUSES.some((s) => s === v);

/** Số ký tự Unicode (emoji tính 1) — cùng cách đếm với char_length của PostgreSQL */
export const feedbackLength = (content: string) => [...content].length;

export type CreateFeedbackResult = { ok: true; id: number } | { ok: false; reason: "rate_limited" };

/**
 * Lưu một góp ý. Kiểm tra giới hạn trong cùng giao dịch với khóa theo tài khoản (pg_advisory_xact_lock)
 * để nhiều yêu cầu gửi cùng lúc không vượt giới hạn.
 */
export async function createFeedback(senderAccount: string, content: string): Promise<CreateFeedbackResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`feedback:${senderAccount}`}))`);
    const since = new Date(Date.now() - FEEDBACK_WINDOW_MS);
    const [recent] = await tx
      .select({ n: count() })
      .from(feedback)
      .where(and(eq(feedback.senderAccount, senderAccount), gte(feedback.createdAt, since)));
    if ((recent?.n ?? 0) >= FEEDBACK_DAILY_LIMIT) return { ok: false, reason: "rate_limited" } as const;
    const [row] = await tx.insert(feedback).values({ senderAccount, content }).returning({ id: feedback.id });
    return { ok: true, id: row.id } as const;
  });
}

/** Danh sách góp ý (mới nhất trước), lọc theo trạng thái, phân trang phía server */
export async function listFeedback(filter: FeedbackFilter, table: Pick<TableQuery<string>, "page" | "size">) {
  const where = filter === "all" ? undefined : eq(feedback.status, filter);
  const [totalRow] = await db.select({ n: count() }).from(feedback).where(where);
  const info = pageInfo(totalRow?.n ?? 0, table);
  const rows: FeedbackRow[] =
    info.total === 0 ? [] : await db.select().from(feedback).where(where).orderBy(desc(feedback.createdAt), desc(feedback.id)).limit(info.size).offset(info.offset);
  return { rows, pageInfo: info };
}

/** Góp ý của chính người gửi (mới nhất trước), phân trang phía server. Chỉ lấy ngày gửi + nội dung: người gửi không thấy trạng thái / người xử lý */
export async function listMyFeedback(senderAccount: string, table: Pick<TableQuery<string>, "page" | "size">) {
  const where = eq(feedback.senderAccount, senderAccount);
  const [totalRow] = await db.select({ n: count() }).from(feedback).where(where);
  const info = pageInfo(totalRow?.n ?? 0, table);
  const rows =
    info.total === 0
      ? []
      : await db.select({ id: feedback.id, content: feedback.content, createdAt: feedback.createdAt }).from(feedback).where(where).orderBy(desc(feedback.createdAt), desc(feedback.id)).limit(info.size).offset(info.offset);
  return { rows, pageInfo: info };
}

/** Đổi trạng thái một góp ý; trả về false nếu không có góp ý đó */
export async function updateFeedbackStatus(id: number, status: FeedbackStatus, handledBy: string): Promise<boolean> {
  const updated = await db.update(feedback).set({ status, handledBy, handledAt: new Date() }).where(eq(feedback.id, id)).returning({ id: feedback.id });
  return updated.length > 0;
}
