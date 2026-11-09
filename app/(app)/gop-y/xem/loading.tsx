import { getTranslations } from "next-intl/server";
import { PagerSkeleton, SkeletonRows } from "@/components/Skeleton";
import { FEEDBACK_FILTERS } from "@/lib/feedback";
import { COLUMNS } from "./columns";

/**
 * Khung chờ cả trang: dựng bằng đúng các lớp của trang thật — tiêu đề, thanh lọc trạng thái, đầu bảng, khung bảng cao cố định 6 dòng,
 * thanh phân trang — để khi dữ liệu về bố cục không nhảy. Chữ cố định hiện thật; phần phụ thuộc dữ liệu là khối xám.
 */
export default async function Loading() {
  const t = await getTranslations();
  return (
    <>
      <h1 className="feedback-title">{t("feedback.view.title")}</h1>
      <div className="card feedback-list" role="status" aria-busy="true" aria-label={t("common.loading")}>
        <div className="toolbar" aria-hidden="true">
          <div className="seg">
            {FEEDBACK_FILTERS.map((f, i) => (
              <span key={f} className="seg-btn" aria-current={i === 0 ? "true" : undefined}>
                {f === "all" ? t("feedback.view.filterAll") : t(`feedback.view.status.${f}`)}
              </span>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table className="tbl" aria-hidden="true">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.id}>{t(c.label)}</th>
                ))}
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
