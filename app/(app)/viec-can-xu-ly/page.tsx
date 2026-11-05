import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Suspense } from "react";
import InboxRows from "@/components/InboxRows";
import { QuickFilter, SearchPanel } from "@/components/InboxSearch";
import { InboxSelection, ResetSelection, SelectAllTh } from "@/components/InboxSelection";
import Pager from "@/components/Pager";
import SortTh from "@/components/SortTh";
import { PagerSkeleton, SkeletonRows } from "@/components/Skeleton";
import { isLocale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/auth";
import { INBOX_SORTS, type InboxSearch, type InboxTab, listActiveSystems, listInbox } from "@/lib/store";
import { keepTableParams, parseTableQuery } from "@/lib/table";
import { COLUMNS, TABS } from "./columns";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("meta"))("appTitle") };
}

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const PATH = "/viec-can-xu-ly";

export default async function InboxPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [user, t, localeRaw, systems] = await Promise.all([getCurrentUser(), getTranslations(), getLocale(), listActiveSystems()]);
  const locale = isLocale(localeRaw) ? localeRaw : "vi";

  const tab = TABS.find((x) => x === one(sp.tab)) ?? "todo";
  // Giá trị lạ trên URL → tất cả hệ thống
  const system = systems.find((s) => s.key === one(sp.system))?.key ?? "all";
  // Điều kiện tìm kiếm (khung tìm kiếm phía trên bảng)
  const search: InboxSearch = { code: one(sp.code).trim().slice(0, 100), title: one(sp.title).trim().slice(0, 100), requester: one(sp.requester).trim().slice(0, 100) };
  const table = parseTableQuery(sp, INBOX_SORTS);
  const keep = keepTableParams(table);
  const filtered = Object.values(search).some((v) => v !== "") || system !== "all";

  // Không chờ ở đây: khung trang hiện ngay; số trên tab + thân bảng chờ chung một lần truy vấn trong <Suspense>
  const data = listInbox(user.account, { tab, system, ...search }, table);
  // Gắn sẵn một nhánh xử lý để Node không coi là "unhandled rejection" khi await muộn; lỗi vẫn ném ở nơi await (error.tsx)
  data.catch(() => undefined);
  const dataKey = JSON.stringify([tab, system, search, table.page, table.size, table.sort, table.dir]);

  /** Link giữ bộ lọc hiện tại, đổi các tham số trong patch (rỗng = bỏ) */
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ tab, system, ...search, ...keep, ...(table.page > 1 ? { page: String(table.page) } : {}), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v || (v === "all" && k === "system")) p.delete(k);
    const s = p.toString();
    return s ? `${PATH}?${s}` : PATH;
  };
  /** Đổi tab / bộ lọc / tìm kiếm: về trang 1 */
  const filterHref = (patch: Record<string, string>) => href({ page: "", ...patch });

  const sortHref = (col: string) => {
    const nextDir = table.sort === col && table.dir === "asc" ? "desc" : "asc";
    return href({ page: "", sort: col, dir: nextDir });
  };

  const head = (
    <thead>
      <tr>
        {COLUMNS.map((c) =>
          !("label" in c) ? (
            <SelectAllTh key={c.id} />
          ) : "sort" in c ? (
            <SortTh key={c.id} href={sortHref(c.sort)} dir={table.sort === c.sort ? table.dir : null}>{t(c.label)}</SortTh>
          ) : (
            <th key={c.id} scope="col" className={"right" in c ? "right" : undefined}>{t(c.label)}</th>
          ),
        )}
      </tr>
    </thead>
  );

  return (
    <>
      {/* Tiêu đề không hiện trên màn hình (thanh trên cùng đã có tên hệ thống); giữ cho trình đọc màn hình */}
      <h1 className="sr-only">{t("meta.appTitle")}</h1>

      <InboxSelection>
      {/* Tìm kiếm giữ tab / hệ thống / số dòng / sắp xếp, về trang 1 */}
      <SearchPanel values={search} keep={{ ...(tab !== "todo" ? { tab } : {}), ...(system !== "all" ? { system } : {}), ...keep }} />
      <div className="card">
        {/* Tab và ô lọc nhanh chung một hàng */}
        <div className="tabbar">
          <nav className="tabs" aria-label={t("inbox.tabsLabel")}>
            <Suspense key={dataKey} fallback={TABS.map((id) => <TabLink key={id} id={id} active={tab} href={filterHref({ tab: id })} label={t(`inbox.tabs.${id}`)} />)}>
              <TabsWithCounts data={data} active={tab} hrefs={Object.fromEntries(TABS.map((id) => [id, filterHref({ tab: id })]))} labels={Object.fromEntries(TABS.map((id) => [id, t(`inbox.tabs.${id}`)]))} />
            </Suspense>
          </nav>
          <QuickFilter />
        </div>

        {systems.length > 1 && (
          <div className="toolbar">
            <nav className="seg" aria-label={t("inbox.filter.systemLabel")}>
              {[{ key: "all", name: t("inbox.filter.allSystems") }, ...systems.map((s) => ({ key: s.key, name: locale === "ja" ? s.nameJa : s.nameVi }))].map((s) => (
                <Link key={s.key} href={filterHref({ system: s.key })} className="seg-btn" aria-current={system === s.key ? "true" : undefined} scroll={false}>
                  {s.name}
                </Link>
              ))}
            </nav>
          </div>
        )}

        <div className="table-wrap">
          <table className="tbl">
            {head}
            <Suspense
              key={dataKey}
              fallback={
                <SkeletonRows columns={COLUMNS} rows={Math.min(table.size, 10)} />
              }
            >
              <TableBody data={data} filtered={filtered} />
            </Suspense>
          </table>
        </div>
        <Suspense key={dataKey} fallback={<PagerSkeleton />}>
          <PagerData data={data} sizeHref={(size) => href({ page: "", size: size === 10 ? "" : String(size) })} pageHref={(page) => href({ page: page > 1 ? String(page) : "" })} />
        </Suspense>
      </div>
      </InboxSelection>
    </>
  );
}

type InboxData = ReturnType<typeof listInbox>;

function TabLink({ id, active, href, label, count }: { id: InboxTab; active: InboxTab; href: string; label: string; count?: number }) {
  return (
    <Link href={href} className="tab" aria-current={active === id ? "page" : undefined} scroll={false}>
      {label}
      {/* Chưa có số (đang chờ dữ liệu): khối chờ cùng cỡ để tab không đổi bề ngang */}
      {count !== undefined ? <span className="tab-count">{count}</span> : <span className="sk sk-count" aria-hidden="true" />}
    </Link>
  );
}

/** Tab kèm số đếm — chờ dữ liệu trong <Suspense> riêng */
async function TabsWithCounts({ data, active, hrefs, labels }: { data: InboxData; active: InboxTab; hrefs: Record<string, string>; labels: Record<string, string> }) {
  const { counts } = await data;
  return TABS.map((id) => <TabLink key={id} id={id} active={active} href={hrefs[id]} label={labels[id]} count={counts[id]} />);
}

async function TableBody({ data, filtered }: { data: InboxData; filtered: boolean }) {
  const { rows } = await data;
  const t = await getTranslations("inbox.empty");
  if (rows.length === 0) {
    return (
      <tbody>
        <ResetSelection />
        <tr>
          <td colSpan={COLUMNS.length} className="empty">
            <strong>{filtered ? t("noneFiltered") : t("none")}</strong>
            {filtered && <span className="muted">{t("hint")}</span>}
          </td>
        </tr>
      </tbody>
    );
  }
  return <InboxRows rows={rows} />;
}

async function PagerData({ data, sizeHref, pageHref }: { data: InboxData; sizeHref: (size: number) => string; pageHref: (page: number) => string }) {
  const { pageInfo } = await data;
  return <Pager info={pageInfo} sizeHref={sizeHref} pageHref={pageHref} />;
}
