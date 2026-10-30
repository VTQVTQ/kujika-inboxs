/** Ngôn ngữ giao diện. Lựa chọn lưu ở cookie của trình duyệt (server đọc được khi render → không nháy chữ). */
export const LOCALES = ["vi", "ja"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "vi";
export const LOCALE_COOKIE = "inbox_locale";
/** Múi giờ hiển thị không đổi theo ngôn ngữ */
export const TIME_ZONE = "Asia/Ho_Chi_Minh";
/** Locale dùng cho Intl (định dạng số, ngày) */
export const INTL_LOCALE: Record<Locale, string> = { vi: "vi-VN", ja: "ja-JP" };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}
