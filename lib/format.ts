import { INTL_LOCALE, type Locale, TIME_ZONE } from "@/i18n/config";

/** Số theo ngôn ngữ (ngăn cách hàng nghìn) */
export const fmtNum = (n: number, locale: Locale) => new Intl.NumberFormat(INTL_LOCALE[locale]).format(n);

/** Ngày theo ngôn ngữ, múi giờ cố định */
export const fmtDate = (iso: string | null, locale: Locale) =>
  iso ? new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)) : "";

export const fmtDateTime = (iso: string | null, locale: Locale) =>
  iso
    ? new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
    : "";

/** Ngày dạng năm/tháng/ngày (2026/06/23) như ô ký trên biểu mẫu giấy, múi giờ cố định */
export const fmtStampDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("ja-JP", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)) : "";
