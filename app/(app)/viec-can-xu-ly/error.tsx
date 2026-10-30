"use client";

import { useTranslations } from "next-intl";

/** Lỗi khi tải danh sách: không lộ chi tiết nội bộ, chỉ cho thử lại */
export default function RouteError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("inbox.error");
  return (
    <div className="card state-box" role="alert">
      <h2>{t("title")}</h2>
      <button type="button" className="btn btn-primary" onClick={reset}>{t("retry")}</button>
    </div>
  );
}
