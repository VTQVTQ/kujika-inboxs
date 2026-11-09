"use client";

import { useTranslations } from "next-intl";

/** Thanh phân trang gọn (Trước / Sau) dùng chung cho các danh sách trong hộp thoại góp ý */
export default function FeedbackPager({
  page,
  pageCount,
  onPage,
  note,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  /** Thông báo ngắn (ví dụ kết quả đổi trạng thái) hiện giữa thanh, không chiếm thêm dòng */
  note?: React.ReactNode;
}) {
  const t = useTranslations("feedback.pager");
  return (
    <div className="feedback-pager">
      <span className="muted">{t("pageOf", { page, count: pageCount })}</span>
      <span className="feedback-pager-note">{note}</span>
      <div className="feedback-pager-btns">
        <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t("prev")}</button>
        <button type="button" className="btn btn-sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>{t("next")}</button>
      </div>
    </div>
  );
}
