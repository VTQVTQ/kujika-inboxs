import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/** Thời điểm có múi giờ, giữ nguyên Date ở phía code */
const tstz = (name: string) => timestamp(name, { precision: 6, withTimezone: true, mode: "date" });

/** Vai trò của một bước duyệt: CONFIRM = xác nhận, DECIDE = phê duyệt */
export const stepRole = pgEnum("StepRole", ["CONFIRM", "DECIDE"]);

/** Mức độ ưu tiên của việc */
export const requestPriority = pgEnum("RequestPriority", ["LOW", "MEDIUM", "HIGH"]);

/** Trạng thái một việc: PENDING = đang chờ người được giao, DONE = đã xử lý, RETURNED = đã trả lại, CANCELLED = bị hủy / thu hồi ở hệ thống gốc */
export const inboxStatus = pgEnum("InboxStatus", ["PENDING", "DONE", "RETURNED", "CANCELLED"]);

export type StepRole = (typeof stepRole.enumValues)[number];
export type RequestPriority = (typeof requestPriority.enumValues)[number];
export type InboxStatus = (typeof inboxStatus.enumValues)[number];

/** Tóm tắt ngắn của việc (chỉ các khóa trong whitelist của lib/contract.ts; không chứa dữ liệu nhạy cảm như tồn kho) */
export type InboxSummary = { lineCount?: number; totalQty?: number };

/** Một bước trong tuyến phê duyệt đầy đủ của đề nghị (kể cả bước chưa tới lượt: WAITING). Chỉ để hiển thị */
export type InboxRouteStep = {
  stepNo: number;
  role: StepRole;
  assigneeAccount: string;
  assigneeName?: string;
  status: InboxStatus | "WAITING";
  actedAt: string | null;
};

/** Một dòng hàng của đề nghị (để hiển thị đúng như biểu mẫu giấy): tên, số lượng, lý do */
export type InboxLine = { name: string; qty: number; reason: string | null };

/**
 * Hệ thống nguồn đã đăng ký (kho, ...). Chỉ hệ thống có mã (token) riêng mới ghi được việc của chính nó.
 * Đăng ký / sửa qua API quản trị /api/v1/systems; không lưu token, chỉ lưu bản băm.
 */
export const inboxSystems = pgTable("inbox_systems", {
  /** Khóa hệ thống (chữ thường, số, gạch dưới / gạch ngang). VD: kho */
  key: text("key").primaryKey(),
  /** Tên hiển thị tiếng Việt */
  nameVi: text("name_vi").notNull(),
  /** Tên hiển thị tiếng Nhật */
  nameJa: text("name_ja").notNull(),
  /** Địa chỉ gốc (không có "/" cuối) của hệ thống, ghép với deep_link để mở việc ở tab mới. VD: http://kho.fivestar.local:3000 */
  baseUrl: text("base_url").notNull(),
  /** SHA-256 (hex) của mã API của hệ thống; mã gốc chỉ hiện một lần khi tạo / đổi */
  tokenHash: text("token_hash").notNull(),
  /** true = cho xử lý (xác nhận / phê duyệt / trả lại) ngay trên hộp việc bằng cách gọi API của hệ thống nguồn; false = chỉ xem và mở hệ thống gốc */
  inlineAct: boolean("inline_act").notNull().default(false),
  /** Phiên bản bí mật ký lời gọi xử lý: bí mật suy ra từ INBOX_SIGNING_KEY + khóa hệ thống + phiên bản; tăng số này để đổi bí mật (bí mật cũ hết hiệu lực) */
  actionSecretVersion: integer("action_secret_version").notNull().default(1),
  /** false = hệ thống tạm ngưng: không nhận dữ liệu mới và không hiện việc trên trang */
  isActive: boolean("is_active").notNull().default(true),
  /** Lúc đăng ký */
  createdAt: tstz("created_at").notNull().defaultNow(),
  /** Lúc sửa gần nhất */
  updatedAt: tstz("updated_at").notNull().defaultNow(),
});

/**
 * Hộp việc cần xử lý: mỗi dòng là một bước duyệt gán cho một người, do hệ thống nguồn gửi sang.
 * Chỉ là bản sao tóm tắt để hiển thị và chuyển sang hệ thống gốc xử lý; dữ liệu nghiệp vụ và việc duyệt vẫn ở hệ thống gốc.
 * Ghi qua lib/store.ts (API /api/v1), không ghi tay.
 */
export const approvalInbox = pgTable(
  "approval_inbox",
  {
    /** Mã tự tăng */
    id: serial("id").primaryKey(),
    /** Hệ thống nguồn (inbox_systems.key) */
    sourceSystem: text("source_system")
      .notNull()
      .references(() => inboxSystems.key, { onDelete: "restrict" }),
    /** Loại đối tượng ở hệ thống nguồn. VD: IN, OUT, SUPPLY */
    sourceType: text("source_type").notNull(),
    /** Mã đối tượng (đề nghị) ở hệ thống nguồn */
    sourceId: text("source_id").notNull(),
    /** Thứ tự bước duyệt trong đề nghị, bắt đầu từ 1 */
    stepNo: integer("step_no").notNull(),
    /** Vai trò của bước: CONFIRM / DECIDE */
    role: stepRole("role").notNull(),
    /** Tài khoản AD người được giao, viết thường (không kèm domain) */
    assigneeAccount: text("assignee_account").notNull(),
    /** Trạng thái việc */
    status: inboxStatus("status").notNull(),
    /** Số chứng từ để hiển thị. VD: ĐN-XĐ-202610-002 */
    code: text("code").notNull(),
    /** Tiêu đề / nội dung ngắn để hiển thị */
    title: text("title").notNull(),
    /** Tên người đề nghị (chỉ để hiển thị) */
    requesterName: text("requester_name").notNull(),
    /** Mức độ ưu tiên: LOW / MEDIUM / HIGH */
    priority: requestPriority("priority").notNull().default("LOW"),
    /** Đường dẫn tương đối tới màn xử lý ở hệ thống nguồn (ghép với base_url của hệ thống). VD: /de-nghi/12 */
    deepLink: text("deep_link").notNull(),
    /** Tóm tắt ngắn (số dòng, tổng số lượng...) */
    summary: jsonb("summary").$type<InboxSummary>().notNull().default({}),
    /** Tuyến phê duyệt đầy đủ của đề nghị (giống nhau ở mọi bước của đề nghị); rỗng = hệ thống nguồn chưa gửi */
    route: jsonb("route").$type<InboxRouteStep[]>().notNull().default([]),
    /** Các dòng hàng của đề nghị (giống nhau ở mọi bước của đề nghị); rỗng = hệ thống nguồn chưa gửi */
    lines: jsonb("lines").$type<InboxLine[]>().notNull().default([]),
    /** Lúc đề nghị được gửi */
    submittedAt: tstz("submitted_at").notNull(),
    /** Lúc bước này được xử lý */
    actedAt: tstz("acted_at"),
    /** Mốc thời gian của lần đồng bộ đã ghi dòng này; bản đồng bộ cũ hơn bị bỏ qua */
    sourceVersion: tstz("source_version").notNull(),
  },
  (t) => [
    uniqueIndex("approval_inbox_source_step_key").on(t.sourceSystem, t.sourceId, t.stepNo),
    index("approval_inbox_assignee_status_idx").on(t.assigneeAccount, t.status, t.submittedAt, t.id),
    check("approval_inbox_step_no_positive", sql`${t.stepNo} > 0`),
  ],
);

export type InboxSystemRow = typeof inboxSystems.$inferSelect;
export type ApprovalInboxRow = typeof approvalInbox.$inferSelect;

/** Trạng thái xử lý góp ý (text + CHECK, không dùng enum để chỉ thêm đúng 1 bảng) */
export const FEEDBACK_STATUSES = ["NEW", "IN_PROGRESS", "DONE", "REJECTED"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** Hòm thư góp ý: người dùng gửi mong muốn / báo lỗi / bất cập tới nhóm phát triển (một chiều) */
export const feedback = pgTable(
  "feedback",
  {
    /** Mã tự tăng */
    id: serial("id").primaryKey(),
    /** Tài khoản AD người gửi, viết thường, không kèm domain (lấy ở server) */
    senderAccount: text("sender_account").notNull(),
    /** Nội dung góp ý (1–5000 ký tự) */
    content: text("content").notNull(),
    /** NEW / IN_PROGRESS / DONE / REJECTED */
    status: text("status").$type<FeedbackStatus>().notNull().default("NEW"),
    /** Dev-admin cập nhật trạng thái gần nhất */
    handledBy: text("handled_by"),
    /** Lúc cập nhật trạng thái gần nhất */
    handledAt: tstz("handled_at"),
    /** Lúc gửi */
    createdAt: tstz("created_at").notNull().defaultNow(),
    /** Lúc sửa gần nhất (cập nhật ở code) */
    updatedAt: tstz("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("feedback_created_idx").on(t.createdAt.desc(), t.id.desc()),
    index("feedback_sender_idx").on(t.senderAccount, t.createdAt),
    check("feedback_content_len", sql`char_length(${t.content}) BETWEEN 1 AND 5000`),
    check("feedback_status_check", sql`${t.status} IN ('NEW', 'IN_PROGRESS', 'DONE', 'REJECTED')`),
    check("feedback_handled_pair", sql`(${t.handledBy} IS NULL) = (${t.handledAt} IS NULL)`),
  ],
);

export type FeedbackRow = typeof feedback.$inferSelect;
