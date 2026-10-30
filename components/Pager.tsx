import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { isLocale } from "@/i18n/config";
import { fmtNum } from "@/lib/format";
import { PAGE_SIZES, type PageInfo } from "@/lib/table";

/** Chân bảng: số dòng đang xem, chọn số dòng / trang, trang trước / sau (mọi trạng thái nằm trên URL) */
export default async function Pager({ info, sizeHref, pageHref }: { info: PageInfo; sizeHref: (size: number) => string; pageHref: (page: number) => string }) {
  const [t, localeRaw] = await Promise.all([getTranslations("inbox.pager"), getLocale()]);
  const locale = isLocale(localeRaw) ? localeRaw : "vi";
  const from = info.total === 0 ? 0 : info.offset + 1;
  const to = Math.min(info.offset + info.size, info.total);
  return (
    <nav className="pager" aria-label={t("label")}>
      <span className="muted">{t("range", { from: fmtNum(from, locale), to: fmtNum(to, locale), total: fmtNum(info.total, locale) })}</span>
      <div className="pager-end">
        <span className="seg" role="group" aria-label={t("perPage")}>
          {PAGE_SIZES.map((s) => (
            <Link key={s} href={sizeHref(s)} className="seg-btn" aria-current={s === info.size ? "true" : undefined} scroll={false}>
              {s}
            </Link>
          ))}
        </span>
        {info.pageCount > 1 && (
          <span className="pager-pages">
            {info.page > 1 ? (
              <Link href={pageHref(info.page - 1)} className="btn btn-sm" scroll={false}>{t("prev")}</Link>
            ) : (
              <span className="btn btn-sm" aria-disabled="true">{t("prev")}</span>
            )}
            <span className="muted">{t("page", { page: info.page, pages: info.pageCount })}</span>
            {info.page < info.pageCount ? (
              <Link href={pageHref(info.page + 1)} className="btn btn-sm" scroll={false}>{t("next")}</Link>
            ) : (
              <span className="btn btn-sm" aria-disabled="true">{t("next")}</span>
            )}
          </span>
        )}
      </div>
    </nav>
  );
}
