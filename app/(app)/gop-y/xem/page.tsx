import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import FeedbackStatusSelect from "@/components/FeedbackStatusSelect";
import Pager from "@/components/Pager";
import { PagerSkeleton, SkeletonRows } from "@/components/Skeleton";
import { FEEDBACK_STATUSES } from "@/db/schema";
import { isLocale, type Locale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/auth";
import { displayAccount } from "@/lib/auth-identity";
import { FEEDBACK_FILTERS, type FeedbackFilter, isFeedbackAdmin, listFeedback } from "@/lib/feedback";
import { fmtDateTime } from "@/lib/format";
import { keepTableParams, parseTableQuery } from "@/lib/table";
import { COLUMNS } from "./columns";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("feedback.meta"))("view") };
}

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const PATH = "/gop-y/xem";

/** Xem góp ý — chỉ dev-admin (layout.tsx đã chặn; kiểm tra lại ở đây) */
export default async function FeedbackViewPage({ searchParams }: { searchParams: SP }) {
  const [sp, user, t, localeRaw] = await Promise.all([searchParams, getCurrentUser(), getTranslations(), getLocale()]);
  if (!isFeedbackAdmin(user.account)) notFound();
  const locale = isLocale(localeRaw) ? localeRaw : "vi";

  // Giá trị lạ trên URL → tất cả
  const filter = FEEDBACK_FILTERS.find((f) => f === one(sp.status)) ?? "all";
  const table = parseTableQuery(sp, [] as readonly never[]);
  const keep = keepTableParams(table);

  // Không chờ ở đây: khung trang hiện ngay; thân bảng + phân trang chờ chung một lần truy vấn trong <Suspense>
  const data = listFeedback(filter, table);
  // Gắn sẵn một nhánh xử lý để Node không coi là "unhandled rejection" khi await muộn; lỗi vẫn ném ở nơi await (error.tsx)
  data.catch(() => undefined);
  const dataKey = JSON.stringify([filter, table.page, table.size]);

  /** Link giữ bộ lọc + số dòng hiện tại, đổi các tham số trong patch (rỗng = bỏ) */
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(filter !== "all" ? { status: filter } : {}), ...keep, ...(table.page > 1 ? { page: String(table.page) } : {}), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    const s = p.toString();
    return s ? `${PATH}?${s}` : PATH;
  };
  /** Đổi bộ lọc: về trang 1 */
  const filterHref = (f: FeedbackFilter) => href({ page: "", status: f === "all" ? "" : f });

  const statusOptions = FEEDBACK_STATUSES.map((s) => ({ value: s, label: t(`feedback.view.status.${s}`) }));

  return (
    <>
      <h1 className="feedback-title">{t("feedback.view.title")}</h1>
      <div className="card feedback-list">
        <div className="toolbar">
          <nav className="seg" aria-label={t("feedback.view.filterLabel")}>
            {FEEDBACK_FILTERS.map((f) => (
              <Link key={f} href={filterHref(f)} className="seg-btn" aria-current={filter === f ? "true" : undefined} scroll={false}>
                {f === "all" ? t("feedback.view.filterAll") : t(`feedback.view.status.${f}`)}
              </Link>
            ))}
          </nav>
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.id} scope="col">{t(c.label)}</th>
                ))}
              </tr>
            </thead>
            <Suspense key={dataKey} fallback={<SkeletonRows columns={COLUMNS} rows={Math.min(table.size, 10)} />}>
              <TableBody data={data} filtered={filter !== "all"} locale={locale} statusOptions={statusOptions} statusLabel={t("feedback.view.statusLabel")} />
            </Suspense>
          </table>
        </div>
        <Suspense key={dataKey} fallback={<PagerSkeleton />}>
          <PagerData data={data} sizeHref={(size) => href({ page: "", size: size === 10 ? "" : String(size) })} pageHref={(page) => href({ page: page > 1 ? String(page) : "" })} />
        </Suspense>
      </div>
    </>
  );
}

type FeedbackData = ReturnType<typeof listFeedback>;

async function TableBody({
  data,
  filtered,
  locale,
  statusOptions,
  statusLabel,
}: {
  data: FeedbackData;
  filtered: boolean;
  locale: Locale;
  statusOptions: { value: string; label: string }[];
  statusLabel: string;
}) {
  const [{ rows }, t] = await Promise.all([data, getTranslations("feedback.view")]);
  if (rows.length === 0) {
    return (
      <tbody>
        <tr>
          <td colSpan={COLUMNS.length} className="empty">
            <strong>{filtered ? t("emptyFiltered") : t("empty")}</strong>
          </td>
        </tr>
      </tbody>
    );
  }
  return (
    <tbody>
      {rows.map((r) => (
        <tr key={r.id}>
          <td className="nowrap">{fmtDateTime(r.createdAt.toISOString(), locale)}</td>
          <td className="nowrap">{displayAccount(r.senderAccount)}</td>
          {/* Chữ thuần (React tự escape), giữ xuống dòng */}
          <td><div className="feedback-content">{r.content}</div></td>
          <td><FeedbackStatusSelect id={r.id} status={r.status} options={statusOptions} label={statusLabel} /></td>
          <td>
            {r.handledBy && r.handledAt ? (
              <>
                <span className="nowrap">{displayAccount(r.handledBy)}</span>
                <span className="muted feedback-handled-at">{fmtDateTime(r.handledAt.toISOString(), locale)}</span>
              </>
            ) : (
              <span className="muted">{t("handledNone")}</span>
            )}
          </td>
        </tr>
      ))}
    </tbody>
  );
}

async function PagerData({ data, sizeHref, pageHref }: { data: FeedbackData; sizeHref: (size: number) => string; pageHref: (page: number) => string }) {
  const { pageInfo } = await data;
  return <Pager info={pageInfo} sizeHref={sizeHref} pageHref={pageHref} />;
}
