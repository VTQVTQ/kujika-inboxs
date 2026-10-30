"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { isLocale } from "@/i18n/config";
import { getRouteAction } from "@/lib/actions";
import { fmtDateTime, fmtNum } from "@/lib/format";
import type { InboxRow, RouteStep } from "@/lib/store";

/**
 * Xem một việc. Chỉ dùng các trường chung của hộp việc (không có phần riêng của từng hệ thống)
 * nên mọi hệ thống nguồn hiển thị giống nhau. Việc được xử lý ở hệ thống gốc: nút mở ở tab mới.
 */
export default function InboxViewDialog({ row, onClose, onAct }: { row: InboxRow; onClose: () => void; onAct: (action: "approve" | "return") => void }) {
  const t = useTranslations();
  const localeRaw = useLocale();
  const locale = isLocale(localeRaw) ? localeRaw : "vi";
  const ref = useRef<HTMLDialogElement>(null);

  const [route, setRoute] = useState<RouteStep[] | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    let alive = true;
    getRouteAction(row.id).then((r) => alive && setRoute(r), () => alive && setRoute([]));
    return () => {
      alive = false;
    };
  }, [row.id]);

  const openLink = (
    <a className={`btn${row.status === "PENDING" && !row.canAct ? " btn-primary" : ""}`} href={row.href} target="_blank" rel="noreferrer">
      {t("common.openOriginal")}
      <span aria-hidden="true"> ↗</span>
    </a>
  );

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="inbox-view-title"
      onClose={onClose}
      // Bấm ra ngoài hộp thoại (vào phần nền) để đóng
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="modal-head">
        <h2 id="inbox-view-title">{t("inbox.view.title", { code: row.code })}</h2>
        <p className="muted">{row.systemName[locale]}</p>
      </div>
      <dl className="info-grid">
        <div><dt>{t("inbox.view.system")}</dt><dd>{row.systemName[locale]}</dd></div>
        <div><dt>{t("inbox.view.code")}</dt><dd className="mono">{row.code}</dd></div>
        <div className="span"><dt>{t("inbox.table.colContent")}</dt><dd>{row.title}</dd></div>
        {row.lineCount !== null && row.totalQty !== null && (
          <div className="span"><dt>{t("inbox.view.summary")}</dt><dd>{t("inbox.table.lineSummary", { lines: fmtNum(row.lineCount, locale), qty: fmtNum(row.totalQty, locale) })}</dd></div>
        )}
        <div><dt>{t("inbox.table.colRequester")}</dt><dd>{row.requesterName}</dd></div>
        <div><dt>{t("inbox.table.colPriority")}</dt><dd><span className={`pill pill-${row.priority.toLowerCase()}`}>{t(`priority.${row.priority}`)}</span></dd></div>
        <div><dt>{t("inbox.table.colSubmitted")}</dt><dd>{fmtDateTime(row.submittedAt, locale)}</dd></div>
        <div><dt>{t("inbox.table.colTask")}</dt><dd>{t(`roles.${row.role}`)}</dd></div>
        <div>
          <dt>{t("inbox.view.status")}</dt>
          <dd>{t(`inbox.status.${row.status}`)}{row.actedAt && ` · ${fmtDateTime(row.actedAt, locale)}`}</dd>
        </div>
      </dl>
      <h3 className="route-title">{t("inbox.view.routeTitle")}</h3>
      {route === null ? (
        <p className="muted route-title" role="status">{t("inbox.view.routeLoading")}</p>
      ) : route.length === 0 ? (
        <p className="muted route-title">{t("inbox.view.routeEmpty")}</p>
      ) : (
        <ol className="route">
          {route.map((s) => (
            <li key={s.stepNo} data-status={s.status}>
              <span className="route-no">{s.stepNo}</span>
              <div>
                <div className={s.isMine ? "strong" : undefined}>{s.assigneeName ?? s.assignee}{s.isMine && ` (${t("inbox.view.you")})`}</div>
                <div className="muted small">{t(`roles.${s.role}`)}{s.assigneeName && ` · ${s.assignee}`}</div>
              </div>
              <div className="right small">
                <div>{t(`inbox.status.${s.status}`)}</div>
                {s.actedAt && <div className="muted">{fmtDateTime(s.actedAt, locale)}</div>}
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="modal-foot">
        <button type="button" className="btn" onClick={() => ref.current?.close()}>{t("common.close")}</button>
        {openLink}
        {row.canAct && (
          <>
            <button type="button" className="btn btn-danger" onClick={() => onAct("return")}>{t("inbox.act.returnBtn")}</button>
            <button type="button" className="btn btn-primary" onClick={() => onAct("approve")}>{t(`roles.${row.role}`)}</button>
          </>
        )}
      </div>
    </dialog>
  );
}
