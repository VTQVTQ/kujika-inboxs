"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { FeedbackStatus } from "@/db/schema";
import { listAllFeedbackAction, type AllFeedbackPage } from "@/lib/feedback-actions";
import { fmtDateTime } from "@/lib/format";
import FeedbackPager from "./FeedbackPager";
import FeedbackStatusSelect, { type FeedbackNotice } from "./FeedbackStatusSelect";

/** Record bắt buộc đủ mọi trạng thái (thiếu / thừa là lỗi biên dịch) mà không kéo db/schema vào bundle trình duyệt */
const STATUS_SET: Record<FeedbackStatus, true> = { NEW: true, IN_PROGRESS: true, DONE: true, REJECTED: true };
const STATUSES = Object.keys(STATUS_SET) as FeedbackStatus[];
type Filter = "all" | FeedbackStatus;
const FILTERS: readonly Filter[] = ["all", ...STATUSES];

/** Tab "Xem góp ý" (chỉ dev-admin): góp ý của mọi người, lọc theo trạng thái, đổi trạng thái ngay trên dòng, phân trang trước / sau */
export default function AllFeedbackList() {
  const t = useTranslations("feedback.view");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<AllFeedbackPage | null>(null);
  const [notice, setNotice] = useState<FeedbackNotice | null>(null);

  useEffect(() => {
    let alive = true;
    listAllFeedbackAction(filter, page)
      .then((r) => alive && setResult(r))
      .catch(() => alive && setResult({ ok: false, error: t("errorLoad") }));
    return () => {
      alive = false;
    };
  }, [filter, page, reload, t]);

  const statusOptions = STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }));
  const label = (f: Filter) => (f === "all" ? t("filterAll") : t(`status.${f}`));

  const body = () => {
    if (result === null) return <p className="feedback-state muted" role="status" aria-busy="true">{tc("loading")}</p>;
    if (!result.ok) {
      return (
        <div className="feedback-state" role="alert">
          <p className="form-error">{result.error}</p>
          <button type="button" className="btn btn-sm" onClick={() => { setResult(null); setReload((n) => n + 1); }}>{t("retry")}</button>
        </div>
      );
    }
    if (result.total === 0) return <p className="feedback-state"><strong>{filter === "all" ? t("empty") : t("emptyFiltered")}</strong></p>;
    return (
      <>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col" className="col-shrink">{t("colSent")}</th>
                <th scope="col">{t("colSender")}</th>
                <th scope="col">{t("colContent")}</th>
                <th scope="col">{t("colStatus")}</th>
                <th scope="col">{t("colHandled")}</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{fmtDateTime(r.createdAt, locale)}</td>
                  <td className="nowrap">{r.sender}</td>
                  {/* Chữ thuần (React tự escape), giữ xuống dòng */}
                  <td><div className="feedback-content">{r.content}</div></td>
                  <td>
                    <FeedbackStatusSelect id={r.id} status={r.status} options={statusOptions} label={t("statusLabel")} onNotice={setNotice} onSaved={() => setReload((n) => n + 1)} />
                  </td>
                  <td>
                    {r.handledBy && r.handledAt ? (
                      <>
                        <span className="nowrap">{r.handledBy}</span>
                        <span className="muted feedback-handled-at">{fmtDateTime(r.handledAt, locale)}</span>
                      </>
                    ) : (
                      <span className="muted">{t("handledNone")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <FeedbackPager
          page={result.page}
          pageCount={result.pageCount}
          onPage={setPage}
          note={notice && <span className={notice.kind === "ok" ? "feedback-ok" : "form-error"} role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</span>}
        />
      </>
    );
  };

  return (
    <div className="feedback-mine">
      <div className="seg" role="group" aria-label={t("filterLabel")}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className="seg-btn"
            aria-pressed={filter === f}
            onClick={() => {
              setNotice(null);
              setResult(null);
              setPage(1);
              setFilter(f);
            }}
          >
            {label(f)}
          </button>
        ))}
      </div>
      {body()}
    </div>
  );
}
