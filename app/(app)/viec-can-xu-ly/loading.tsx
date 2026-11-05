import { getTranslations } from "next-intl/server";
import { SearchPanelSkeleton } from "@/components/InboxSearch";
import { PagerSkeleton, SkeletonRows } from "@/components/Skeleton";
import { COLUMNS, TABS } from "./columns";

/**
 * Khung chờ cả trang (lần đầu vào trang / chuyển trang): dựng bằng đúng các lớp của trang thật — khung tìm kiếm (ô nhập khóa), hàng tab + ô tìm kiếm,
 * đầu bảng, khung bảng cao cố định 6 dòng, thanh phân trang — để khi dữ liệu về bố cục không nhảy.
 * Chữ cố định (tiêu đề, tên tab, tên cột) hiện thật; phần phụ thuộc dữ liệu là khối xám.
 */
export default async function Loading() {
  const t = await getTranslations();
  return (
    <>
      <h1 className="sr-only">{t("meta.appTitle")}</h1>
      <SearchPanelSkeleton />

      <div className="card" role="status" aria-busy="true" aria-label={t("common.loading")}>
        <div className="tabbar">
          <div className="tabs" aria-hidden="true">
            {TABS.map((id, i) => (
              <span key={id} className="tab" aria-current={i === 0 ? "page" : undefined}>
                {t(`inbox.tabs.${id}`)}
                <span className="sk sk-count" />
              </span>
            ))}
          </div>
          <div className="search" aria-hidden="true">
            <span className="sk sk-search" />
          </div>
        </div>

        <div className="table-wrap">
          <table className="tbl" aria-hidden="true">
            <thead>
              <tr>
                {COLUMNS.map((c) =>
                  !("label" in c) ? (
                    <th key={c.id} className="col-check">
                      <input type="checkbox" disabled tabIndex={-1} />
                    </th>
                  ) : (
                    <th key={c.id} className={"right" in c ? "right" : undefined}>
                      {"sort" in c ? (
                        <span className="sort-link">
                          {t(c.label)}
                          <span className="sort-mark">↕</span>
                        </span>
                      ) : (
                        t(c.label)
                      )}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <SkeletonRows columns={COLUMNS} rows={6} />
          </table>
        </div>
        <PagerSkeleton />
      </div>
    </>
  );
}
