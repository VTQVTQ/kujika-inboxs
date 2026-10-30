/**
 * Chuẩn bảng dữ liệu dạng danh sách: phân trang + sắp xếp phía server, trạng thái lưu trên URL.
 *   ?page=2&size=50&sort=code&dir=asc
 * Không có `sort` = thứ tự mặc định của từng danh sách (unsorted). Giá trị sai → dùng mặc định (không tin URL).
 * Dùng được ở cả server (đọc searchParams) và client (TableNav / SortTh / TablePager).
 */

export const PAGE_SIZES = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 10;
/** Lựa chọn số dòng / trang của một bảng; phần tử đầu = mặc định (không ghi lên URL). Bảng không khai báo riêng dùng PAGE_SIZES */
export type PageSizes = readonly number[];

export type SortDir = "asc" | "desc";

export interface TableQuery<S extends string> {
  page: number;
  size: number;
  sort: S | null;
  dir: SortDir;
}

export interface PageInfo {
  /** Trang hiện tại (đã kẹp trong [1, pageCount]) */
  page: number;
  size: number;
  total: number;
  pageCount: number;
  /** OFFSET cho truy vấn */
  offset: number;
}

type RawParams = Record<string, string | string[] | undefined> | URLSearchParams;

function get(p: RawParams, key: string): string | undefined {
  if (p instanceof URLSearchParams) return p.get(key) ?? undefined;
  const v = p[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Đọc page / size / sort / dir từ URL. sortable: các cột cho phép sắp xếp của bảng; sizes: số dòng / trang được chọn (đầu = mặc định) */
export function parseTableQuery<S extends string>(p: RawParams, sortable: readonly S[], sizes: PageSizes = PAGE_SIZES): TableQuery<S> {
  const page = Number.parseInt(get(p, "page") ?? "1", 10);
  const size = Number.parseInt(get(p, "size") ?? "", 10);
  const sort = sortable.find((s) => s === get(p, "sort")) ?? null;
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    size: sizes.includes(size) ? size : sizes[0],
    sort,
    dir: get(p, "dir") === "asc" ? "asc" : "desc",
  };
}

/** Tính trang thực tế (trang vượt quá → trang cuối) và OFFSET */
export function pageInfo(total: number, q: { page: number; size: number }): PageInfo {
  const pageCount = Math.max(1, Math.ceil(total / q.size));
  const page = Math.min(q.page, pageCount);
  return { page, size: q.size, total, pageCount, offset: (page - 1) * q.size };
}

/** Giữ size / sort / dir khi đổi bộ lọc (trang luôn về 1): dùng cho link lọc và form tìm kiếm */
export function keepTableParams(q: TableQuery<string>): Record<string, string> {
  const out: Record<string, string> = {};
  if (q.size !== DEFAULT_PAGE_SIZE) out.size = String(q.size);
  if (q.sort) {
    out.sort = q.sort;
    out.dir = q.dir;
  }
  return out;
}
