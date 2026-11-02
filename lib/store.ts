import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, ne, or, type SQL, sql } from "drizzle-orm";
import { approvalInbox, inboxSystems, type ApprovalInboxRow, type InboxLine, type InboxRouteStep, type InboxStatus, type RequestPriority, type StepRole } from "@/db/schema";
import { ApiError } from "@/lib/api-error";
import type { InboxItem, patchItemSchema } from "@/lib/contract";
import { db } from "@/lib/db";
import { itemUrl } from "@/lib/systems";
import { pageInfo, type TableQuery } from "@/lib/table";
import type { z } from "zod";

/* ------------------------------------------------------------------ */
/* Ghi: hệ thống nguồn → hộp việc                                      */
/* ------------------------------------------------------------------ */

const sameTime = (a: Date | null, b: Date | null) => a?.getTime() === b?.getTime();

/** Dòng đã lưu đã giống hệt việc mong muốn (không cần ghi lại). summary so từng khóa vì jsonb không giữ thứ tự khóa */
function sameItem(stored: ApprovalInboxRow, item: InboxItem, extras: { route: InboxRouteStep[]; lines: InboxLine[] }) {
  return (
    JSON.stringify(stored.route) === JSON.stringify(extras.route) &&
    JSON.stringify(stored.lines) === JSON.stringify(extras.lines) &&
    stored.sourceType === item.sourceType &&
    stored.role === item.role &&
    stored.assigneeAccount === item.assigneeAccount &&
    stored.status === item.status &&
    stored.code === item.code &&
    stored.title === item.title &&
    stored.requesterName === item.requesterName &&
    stored.priority === item.priority &&
    stored.deepLink === item.deepLink &&
    stored.summary.lineCount === item.summary.lineCount &&
    stored.summary.totalQty === item.summary.totalQty &&
    sameTime(stored.submittedAt, item.submittedAt) &&
    sameTime(stored.actedAt, item.actedAt)
  );
}

const fromExcluded = (column: string) => sql.raw(`excluded."${column}"`);

/**
 * Làm hộp việc của một đề nghị khớp đúng danh sách việc mong muốn (thêm / sửa / xóa dòng không còn), trong một transaction.
 * desired đã được kiểm tra bằng inboxItemSchema ở nơi nhận (API). Khóa tư vấn theo (hệ thống, đề nghị) để hai lần gửi cùng một đề nghị không chạy chồng.
 * Bản gửi cũ hơn dữ liệu đã lưu (version nhỏ hơn) bị bỏ qua (stale). items rỗng = xóa mọi việc của đề nghị.
 */
export async function replaceForSource(system: string, sourceId: string, desired: InboxItem[], version = new Date(), extras: { route?: InboxRouteStep[]; lines?: InboxLine[] } = {}) {
  if (new Set(desired.map((i) => i.stepNo)).size !== desired.length) {
    throw new ApiError(400, "duplicate_step", "stepNo bị trùng trong cùng một đề nghị");
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${system}:${sourceId}`}, 0))`);
    const stored = await tx
      .select()
      .from(approvalInbox)
      .where(and(eq(approvalInbox.sourceSystem, system), eq(approvalInbox.sourceId, sourceId)));
    if (stored.some((s) => s.sourceVersion > version)) return { changed: false, stale: true };

    // Không gửi route / lines: giữ bản đã lưu
    const effective = { route: extras.route ?? stored[0]?.route ?? [], lines: extras.lines ?? stored[0]?.lines ?? [] };
    const byStep = new Map(stored.map((s) => [s.stepNo, s]));
    const removedIds = stored.filter((s) => !desired.some((d) => d.stepNo === s.stepNo)).map((s) => s.id);
    const changed = desired.filter((d) => {
      const s = byStep.get(d.stepNo);
      return !s || !sameItem(s, d, effective);
    });
    if (!removedIds.length && !changed.length) return { changed: false, stale: false };

    if (removedIds.length) await tx.delete(approvalInbox).where(inArray(approvalInbox.id, removedIds));
    if (changed.length) {
      await tx
        .insert(approvalInbox)
        .values(changed.map((d) => ({ ...d, ...effective, sourceSystem: system, sourceId, sourceVersion: version })))
        .onConflictDoUpdate({
          target: [approvalInbox.sourceSystem, approvalInbox.sourceId, approvalInbox.stepNo],
          set: {
            sourceType: fromExcluded("source_type"),
            role: fromExcluded("role"),
            assigneeAccount: fromExcluded("assignee_account"),
            status: fromExcluded("status"),
            code: fromExcluded("code"),
            title: fromExcluded("title"),
            requesterName: fromExcluded("requester_name"),
            priority: fromExcluded("priority"),
            deepLink: fromExcluded("deep_link"),
            summary: fromExcluded("summary"),
            route: fromExcluded("route"),
            lines: fromExcluded("lines"),
            submittedAt: fromExcluded("submitted_at"),
            actedAt: fromExcluded("acted_at"),
            sourceVersion: fromExcluded("source_version"),
          },
        });
    }
    return { changed: true, stale: false };
  });
}

/** Sửa một phần một việc đã có (các trường gửi lên); 404 nếu việc không tồn tại */
export async function patchItem(system: string, sourceId: string, stepNo: number, patch: z.output<typeof patchItemSchema>) {
  const [row] = await db
    .update(approvalInbox)
    .set({ ...patch, sourceVersion: new Date() })
    .where(and(eq(approvalInbox.sourceSystem, system), eq(approvalInbox.sourceId, sourceId), eq(approvalInbox.stepNo, stepNo)))
    .returning();
  if (!row) throw new ApiError(404, "item_not_found", "Không tìm thấy việc");
  return row;
}

/* ------------------------------------------------------------------ */
/* Đọc cho API                                                         */
/* ------------------------------------------------------------------ */

/** Chuỗi tìm kiếm → mẫu ILIKE (thoát % _ \ để người dùng không tự ghép ký tự đại diện) */
const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export interface ListFilter {
  system?: string;
  sourceId?: string;
  assignee?: string;
  status?: InboxStatus;
  q?: string;
}

function filterWhere(f: ListFilter): SQL | undefined {
  const q = f.q?.trim();
  return and(
    f.system ? eq(approvalInbox.sourceSystem, f.system) : undefined,
    f.sourceId ? eq(approvalInbox.sourceId, f.sourceId) : undefined,
    f.assignee ? eq(approvalInbox.assigneeAccount, f.assignee.trim().toLowerCase()) : undefined,
    f.status ? eq(approvalInbox.status, f.status) : undefined,
    q ? or(ilike(approvalInbox.code, likePattern(q)), ilike(approvalInbox.title, likePattern(q)), ilike(approvalInbox.requesterName, likePattern(q))) : undefined,
  );
}

export interface ApiItem {
  id: number;
  system: string;
  sourceType: string;
  sourceId: string;
  stepNo: number;
  role: StepRole;
  assigneeAccount: string;
  status: InboxStatus;
  code: string;
  title: string;
  requesterName: string;
  priority: RequestPriority;
  deepLink: string;
  /** Link mở việc ở hệ thống gốc (baseUrl + deepLink) */
  url: string;
  summary: ApprovalInboxRow["summary"];
  submittedAt: string;
  actedAt: string | null;
  sourceVersion: string;
}

export function toApiItem(r: ApprovalInboxRow, baseUrl: string): ApiItem {
  return {
    id: r.id,
    system: r.sourceSystem,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    stepNo: r.stepNo,
    role: r.role,
    assigneeAccount: r.assigneeAccount,
    status: r.status,
    code: r.code,
    title: r.title,
    requesterName: r.requesterName,
    priority: r.priority,
    deepLink: r.deepLink,
    url: itemUrl(baseUrl, r.deepLink),
    summary: r.summary,
    submittedAt: r.submittedAt.toISOString(),
    actedAt: r.actedAt?.toISOString() ?? null,
    sourceVersion: r.sourceVersion.toISOString(),
  };
}

/** Danh sách việc theo bộ lọc, phân trang (API truy vấn). Luôn sắp theo id để trang ổn định */
export async function listItems(filter: ListFilter, page: number, size: number) {
  const where = filterWhere(filter);
  const total = await db.$count(approvalInbox, where);
  const info = pageInfo(total, { page, size });
  const rows =
    total === 0
      ? []
      : await db
          .select({ item: approvalInbox, baseUrl: inboxSystems.baseUrl })
          .from(approvalInbox)
          .innerJoin(inboxSystems, eq(inboxSystems.key, approvalInbox.sourceSystem))
          .where(where)
          .orderBy(asc(approvalInbox.id))
          .limit(info.size)
          .offset(info.offset);
  return { items: rows.map((r) => toApiItem(r.item, r.baseUrl)), page: info.page, size: info.size, total };
}

/* ------------------------------------------------------------------ */
/* Đọc cho trang: việc của một người                                   */
/* ------------------------------------------------------------------ */

export type InboxTab = "todo" | "done";

/** Các cột danh sách cho phép sắp xếp (?sort=) */
export const INBOX_SORTS = ["code", "submitted", "priority"] as const;
export type InboxSort = (typeof INBOX_SORTS)[number];

export interface InboxRow {
  id: number;
  system: string;
  systemName: { vi: string; ja: string };
  type: string;
  code: string;
  title: string;
  requesterName: string;
  priority: RequestPriority;
  role: StepRole;
  status: InboxStatus;
  /** Link mở màn xử lý ở hệ thống nguồn */
  href: string;
  /** Đang chờ người này và hệ thống nguồn cho xử lý ngay trên hộp việc */
  canAct: boolean;
  lineCount: number | null;
  totalQty: number | null;
  submittedAt: string;
  actedAt: string | null;
}

/** Việc của đúng người này (tài khoản AD) ở các hệ thống đang hoạt động — điều kiện nền của mọi truy vấn trang */
const ownedBy = (account: string) => and(eq(approvalInbox.assigneeAccount, account.toLowerCase()), eq(inboxSystems.isActive, true));

/** Hệ thống đang hoạt động (cho bộ lọc hệ thống) */
export async function listActiveSystems() {
  return db
    .select({ key: inboxSystems.key, nameVi: inboxSystems.nameVi, nameJa: inboxSystems.nameJa })
    .from(inboxSystems)
    .where(eq(inboxSystems.isActive, true))
    .orderBy(asc(inboxSystems.key));
}

const countWhere = async (where: SQL | undefined) => {
  const [row] = await db.select({ n: count() }).from(approvalInbox).innerJoin(inboxSystems, eq(inboxSystems.key, approvalInbox.sourceSystem)).where(where);
  return row?.n ?? 0;
};

/**
 * Danh sách việc của một người theo tab + bộ lọc, phân trang + sắp xếp phía server.
 * Không có sort: Chờ xử lý = gửi sớm nhất trước; Đã xử lý = vừa xử lý trước. Luôn thêm id làm tiêu chí phụ.
 */
export async function listInbox(account: string, opts: { tab: InboxTab; system: string; q: string }, table: TableQuery<InboxSort>) {
  const mine = ownedBy(account);
  const tabWhere: Record<InboxTab, SQL | undefined> = {
    todo: and(mine, eq(approvalInbox.status, "PENDING")),
    done: and(mine, ne(approvalInbox.status, "PENDING")),
  };

  const q = opts.q.trim();
  const filters = and(
    tabWhere[opts.tab],
    opts.system !== "all" ? eq(approvalInbox.sourceSystem, opts.system) : undefined,
    q ? or(ilike(approvalInbox.code, likePattern(q)), ilike(approvalInbox.title, likePattern(q)), ilike(approvalInbox.requesterName, likePattern(q))) : undefined,
  );

  const dir = table.dir === "asc" ? asc : desc;
  const orderBy: SQL[] =
    table.sort === "code"
      ? [dir(approvalInbox.code), dir(approvalInbox.id)]
      : table.sort === "submitted"
        ? [dir(approvalInbox.submittedAt), dir(approvalInbox.id)]
        : // Enum RequestPriority sắp theo thứ tự khai báo: LOW < MEDIUM < HIGH
          table.sort === "priority"
          ? [dir(approvalInbox.priority), dir(approvalInbox.id)]
          : opts.tab === "todo"
            ? [asc(approvalInbox.submittedAt), asc(approvalInbox.id)]
            : [sql`${approvalInbox.actedAt} DESC NULLS LAST`, desc(approvalInbox.id)];

  // Đếm trước để kẹp trang (trang vượt quá → trang cuối) rồi mới lấy các dòng của trang
  const [total, todo, done] = await Promise.all([countWhere(filters), countWhere(tabWhere.todo), countWhere(tabWhere.done)]);
  const info = pageInfo(total, table);
  const rows =
    total === 0
      ? []
      : await db
          .select({ item: approvalInbox, baseUrl: inboxSystems.baseUrl, nameVi: inboxSystems.nameVi, nameJa: inboxSystems.nameJa, inlineAct: inboxSystems.inlineAct })
          .from(approvalInbox)
          .innerJoin(inboxSystems, eq(inboxSystems.key, approvalInbox.sourceSystem))
          .where(filters)
          .orderBy(...orderBy)
          .limit(info.size)
          .offset(info.offset);

  return {
    rows: rows.map(
      ({ item: r, baseUrl, nameVi, nameJa, inlineAct }): InboxRow => ({
        id: r.id,
        system: r.sourceSystem,
        systemName: { vi: nameVi, ja: nameJa },
        type: r.sourceType,
        code: r.code,
        title: r.title,
        requesterName: r.requesterName,
        priority: r.priority,
        role: r.role,
        status: r.status,
        href: itemUrl(baseUrl, r.deepLink),
        canAct: r.status === "PENDING" && inlineAct,
        lineCount: r.summary.lineCount ?? null,
        totalQty: r.summary.totalQty ?? null,
        submittedAt: r.submittedAt.toISOString(),
        actedAt: r.actedAt?.toISOString() ?? null,
      }),
    ),
    pageInfo: info,
    counts: { todo, done } satisfies Record<InboxTab, number>,
  };
}

/** Số việc đang chờ người này xử lý */
export async function countInboxPending(account: string) {
  return countWhere(and(ownedBy(account), eq(approvalInbox.status, "PENDING")));
}

/**
 * Việc mà người này được phép xử lý ngay trên hộp việc: đúng tài khoản được giao, đang chờ, hệ thống đang hoạt động và bật inlineAct.
 * null nếu không còn đúng (đã xử lý / thu hồi / không phải việc của người này).
 */
export async function findActionableItem(account: string, id: number) {
  const [row] = await db
    .select({ item: approvalInbox, system: inboxSystems })
    .from(approvalInbox)
    .innerJoin(inboxSystems, eq(inboxSystems.key, approvalInbox.sourceSystem))
    .where(and(eq(approvalInbox.id, id), ownedBy(account), eq(approvalInbox.status, "PENDING"), eq(inboxSystems.inlineAct, true)))
    .limit(1);
  return row ?? null;
}

export interface RouteStep {
  stepNo: number;
  role: StepRole;
  assignee: string;
  /** Họ tên người duyệt (nếu hệ thống nguồn có gửi) */
  assigneeName: string | null;
  /** WAITING = chưa tới lượt */
  status: InboxStatus | "WAITING";
  actedAt: string | null;
}

export interface InboxDetail {
  route: RouteStep[];
  lines: InboxLine[];
}

/**
 * Tuyến phê duyệt đầy đủ + các dòng hàng của đề nghị chứa việc này. Dùng tuyến đầy đủ do hệ thống nguồn gửi (có cả bước chưa tới lượt);
 * hệ thống chưa gửi thì dùng các bước đang có trong hộp việc. Chỉ trả về nếu việc là của đúng người này.
 */
export async function getInboxDetail(account: string, id: number): Promise<InboxDetail> {
  const [own] = await db
    .select({ system: approvalInbox.sourceSystem, sourceId: approvalInbox.sourceId })
    .from(approvalInbox)
    .innerJoin(inboxSystems, eq(inboxSystems.key, approvalInbox.sourceSystem))
    .where(and(eq(approvalInbox.id, id), ownedBy(account)))
    .limit(1);
  if (!own) return { route: [], lines: [] };
  const rows = await db
    .select()
    .from(approvalInbox)
    .where(and(eq(approvalInbox.sourceSystem, own.system), eq(approvalInbox.sourceId, own.sourceId)))
    .orderBy(asc(approvalInbox.stepNo));
  const full: InboxRouteStep[] = rows[0]?.route.length
    ? rows[0].route
    : rows.map((r) => ({ stepNo: r.stepNo, role: r.role, assigneeAccount: r.assigneeAccount, status: r.status, actedAt: r.actedAt?.toISOString() ?? null }));
  // Trạng thái thật của các bước đã có trong hộp việc luôn mới hơn tuyến lưu kèm
  const live = new Map(rows.map((r) => [r.stepNo, r]));
  const route = [...full]
    .sort((a, b) => a.stepNo - b.stepNo)
    .map((s) => {
      const r = live.get(s.stepNo);
      return {
        stepNo: s.stepNo,
        role: s.role,
        assignee: s.assigneeAccount,
        assigneeName: s.assigneeName ?? null,
        status: r?.status ?? s.status,
        actedAt: r ? (r.actedAt?.toISOString() ?? null) : s.actedAt,
      };
    });
  return { route, lines: rows[0]?.lines ?? [] };
}
