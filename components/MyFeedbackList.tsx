"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { listMyFeedbackAction, type MyFeedbackPage } from "@/lib/feedback-actions";
import { fmtDateTime } from "@/lib/format";
import FeedbackPager from "./FeedbackPager";

/** Góp ý của tôi trong hộp thoại: ngày gửi + nội dung, phân trang trước / sau; có trạng thái đang tải, lỗi (thử lại) và trống */
export default function MyFeedbackList() {
  const t = useTranslations("feedback.mine");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<MyFeedbackPage | null>(null);

  useEffect(() => {
    let alive = true;
    listMyFeedbackAction(page)
      .then((r) => alive && setResult(r))
      .catch(() => alive && setResult({ ok: false, error: t("errorLoad") }));
    return () => {
      alive = false;
    };
  }, [page, reload, t]);

  if (result === null) {
    return <p className="feedback-state muted" role="status" aria-busy="true">{tc("loading")}</p>;
  }
  if (!result.ok) {
    return (
      <div className="feedback-state" role="alert">
        <p className="form-error">{result.error}</p>
        <button type="button" className="btn btn-sm" onClick={() => { setResult(null); setReload((n) => n + 1); }}>{t("retry")}</button>
      </div>
    );
  }
  if (result.total === 0) {
    return <p className="feedback-state"><strong>{t("empty")}</strong></p>;
  }
  return (
    <div className="feedback-mine">
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col" className="col-shrink">{t("colSent")}</th>
              <th scope="col">{t("colContent")}</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{fmtDateTime(r.createdAt, locale)}</td>
                <td><div className="feedback-content">{r.content}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FeedbackPager page={result.page} pageCount={result.pageCount} onPage={setPage} />
    </div>
  );
}
