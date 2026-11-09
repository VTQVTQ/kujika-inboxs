import { getTranslations } from "next-intl/server";
import { PagerSkeleton, SkeletonRows } from "@/components/Skeleton";
import { COLUMNS } from "./columns";

/** Khung chờ phần thân: đầu bảng thật, khung bảng cao cố định 6 dòng, thanh phân trang — cùng lớp với trang thật nên bố cục không nhảy */
export default async function Loading() {
  const t = await getTranslations();
  return (
    <div role="status" aria-busy="true" aria-label={t("common.loading")}>
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
  );
}
