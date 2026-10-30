import { z } from "zod";
import { inboxStatus, requestPriority, stepRole } from "@/db/schema";

/**
 * Hợp đồng dữ liệu giữa các hệ thống nguồn và hộp việc (bảng approval_inbox, API /api/v1).
 * Mọi dòng ghi vào hộp việc đều đi qua các schema này; đổi / thêm trường ở đây là đổi hợp đồng cho tất cả hệ thống.
 */

/** Chỉ ký tự in được của ASCII (đã mã hóa URL), bắt đầu bằng một dấu "/" (không phải "//"), không có khoảng trắng hay "\" */
const DEEP_LINK_PATTERN = /^\/(?!\/)[\x21-\x5b\x5d-\x7e]*$/;

/** Khóa hệ thống: chữ thường, số, "_" và "-", bắt đầu bằng chữ cái */
export const SYSTEM_KEY_PATTERN = /^[a-z][a-z0-9_-]{1,29}$/;

/** Mã đối tượng ở hệ thống nguồn (ở đường dẫn API) */
export const SOURCE_ID_MAX = 100;

/** Số việc tối đa trong một lần gửi (một đề nghị không có nhiều bước đến thế) */
export const ITEMS_PER_SOURCE_MAX = 50;

/** Whitelist khóa của summary: chỉ thêm khóa ở đây khi thật sự cần hiển thị; không đưa dữ liệu nhạy cảm (như tồn kho) vào */
const summarySchema = z
  .object({
    lineCount: z.number().int().nonnegative().optional(),
    totalQty: z.number().int().nonnegative().optional(),
  })
  .strict();

const isoDate = z.string().datetime({ offset: true }).transform((s) => new Date(s));

/** Các trường của một việc, trừ khóa (sourceId / stepNo) */
const itemFields = {
  sourceType: z.string().trim().min(1).max(30),
  role: z.enum(stepRole.enumValues),
  assigneeAccount: z.string().trim().min(1).max(100).transform((s) => s.toLowerCase()),
  /** CANCELLED dành cho hệ thống có thao tác hủy riêng */
  status: z.enum(inboxStatus.enumValues),
  code: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(300),
  requesterName: z.string().trim().min(1).max(200),
  priority: z.enum(requestPriority.enumValues),
  deepLink: z.string().max(300).regex(DEEP_LINK_PATTERN, "deepLink phải là đường dẫn tương đối bắt đầu bằng một dấu / (không phải URL đầy đủ)"),
  summary: summarySchema,
  submittedAt: isoDate,
  actedAt: isoDate.nullable(),
};

/** Một việc (một bước duyệt gán cho một người) của một đề nghị ở hệ thống nguồn */
export const inboxItemSchema = z.object({ stepNo: z.number().int().positive(), ...itemFields }).strict();

/** Một bước của tuyến phê duyệt đầy đủ (kể cả bước chưa tới lượt, status WAITING) — chỉ để hiển thị */
export const routeStepSchema = z
  .object({
    stepNo: z.number().int().positive(),
    role: z.enum(stepRole.enumValues),
    assigneeAccount: z.string().trim().min(1).max(100).transform((s) => s.toLowerCase()),
    assigneeName: z.string().trim().min(1).max(200).optional(),
    status: z.enum([...inboxStatus.enumValues, "WAITING"]),
    actedAt: isoDate.nullable().transform((d) => d?.toISOString() ?? null),
  })
  .strict();

/** Thân yêu cầu PUT: toàn bộ việc hiện tại của một đề nghị. sourceVersion = mốc thời gian của trạng thái ở hệ thống nguồn (mặc định: lúc nhận) */
export const replaceSourceSchema = z
  .object({
    sourceVersion: isoDate.optional(),
    items: z.array(inboxItemSchema).max(ITEMS_PER_SOURCE_MAX),
    /** Tuyến phê duyệt đầy đủ (mọi bước). Bỏ qua = giữ tuyến đã lưu */
    route: z.array(routeStepSchema).max(ITEMS_PER_SOURCE_MAX).optional(),
  })
  .strict();

/** Thân yêu cầu PATCH một việc: chỉ các trường gửi lên được sửa (không đổi sourceType / stepNo) */
export const patchItemSchema = z
  .object({ ...itemFields, sourceType: itemFields.sourceType.optional() })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Cần ít nhất một trường để sửa" });

export type InboxItemInput = z.input<typeof inboxItemSchema>;
export type InboxItem = z.output<typeof inboxItemSchema>;

/** Đăng ký hệ thống nguồn */
export const createSystemSchema = z
  .object({
    key: z.string().regex(SYSTEM_KEY_PATTERN),
    nameVi: z.string().trim().min(1).max(100),
    nameJa: z.string().trim().min(1).max(100),
    baseUrl: z.string().trim().max(300),
    inlineAct: z.boolean().optional(),
  })
  .strict();

export const patchSystemSchema = z
  .object({
    nameVi: z.string().trim().min(1).max(100),
    nameJa: z.string().trim().min(1).max(100),
    baseUrl: z.string().trim().max(300),
    isActive: z.boolean(),
    inlineAct: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Cần ít nhất một trường để sửa" });

/** Địa chỉ gốc: chỉ http(s), không kèm đường dẫn / query, bỏ "/" cuối. Sai → null */
export function normalizeBaseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password || url.search || url.hash || url.pathname.replace(/\/+$/, "") !== "") return null;
  return url.origin;
}

/** Tham số truy vấn danh sách việc (API) */
export const listQuerySchema = z.object({
  sourceId: z.string().max(SOURCE_ID_MAX).optional(),
  assignee: z.string().max(100).optional(),
  status: z.enum(inboxStatus.enumValues).optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});
