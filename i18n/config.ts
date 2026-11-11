/** Ngôn ngữ giao diện: chỉ còn tiếng Nhật. */
export const LOCALES = ["ja"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ja";
/** Múi giờ hiển thị không đổi theo ngôn ngữ */
export const TIME_ZONE = "Asia/Ho_Chi_Minh";
/** Locale dùng cho Intl (định dạng số, ngày) */
export const INTL_LOCALE: Record<Locale, string> = { ja: "ja-JP" };
