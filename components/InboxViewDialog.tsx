"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { isLocale } from "@/i18n/config";
import { getDetailAction } from "@/lib/actions";
import { fmtDateTime, fmtNum, fmtStampDate } from "@/lib/format";
import type { InboxDetail, InboxRow, RouteStep } from "@/lib/store";

/**
 * Xem một việc. Chỉ dùng các trường chung của hộp việc (không có phần riêng của từng hệ thống)
 * nên mọi hệ thống nguồn hiển thị giống nhau. Việc được xử lý ở hệ thống gốc: nút mở ở tab mới.
 */
export default function InboxViewDialog({ row, onClose, onAct }: { row: InboxRow; onClose: () => void; onAct: (action: "approve" | "return") => void }) {
  const t = useTranslations();
  const localeRaw = useLocale();
  const locale = isLocale(localeRaw) ? localeRaw : "vi";
  const ref = useRef<HTMLDialogElement>(null);

  const [detail, setDetail] = useState<InboxDetail | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    let alive = true;
    getDetailAction(row.id).then((r) => alive && setDetail(r), () => alive && setDetail({ route: [], lines: [] }));
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

  // Chưa có dòng hàng từ hệ thống nguồn: hiện một dòng tóm tắt từ tiêu đề
  const lines = detail === null ? null : detail.lines.length > 0 ? detail.lines : [{ name: row.title, qty: row.totalQty ?? 0, reason: null }];
  const route = detail?.route ?? [];
  // Thứ tự cột ký như biểu mẫu giấy: 承認 (phê duyệt) rồi 確認 (xác nhận)
  const stampRoles = (["DECIDE", "CONFIRM"] as const).filter((r) => route.length === 0 || route.some((s) => s.role === r));
  const intro = row.type === "IN" ? "introIn" : "introOut";

  return (
    <dialog
      ref={ref}
      className="modal modal-wide"
      aria-labelledby="inbox-view-title"
      onClose={onClose}
      // Bấm ra ngoài hộp thoại (vào phần nền) để đóng
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="modal-head">
        <h2 id="inbox-view-title">{t("inbox.view.title", { code: row.code })}</h2>
        <p className="muted">
          {row.systemName[locale]} · <span className={`pill pill-${row.priority.toLowerCase()}`}>{t(`priority.${row.priority}`)}</span> · {t(`inbox.status.${row.status}`)}
          {row.actedAt && ` · ${fmtDateTime(row.actedAt, locale)}`} · {t("inbox.table.colSubmitted")}: {fmtDateTime(row.submittedAt, locale)}
        </p>
      </div>

      <div className="paper">
        <p className="paper-applicant">
          <span>{t("inbox.view.paper.applicant")} <span aria-hidden="true" className="paper-arrow" /></span>
          <span className="paper-name">{row.requesterName}</span>
        </p>
        <p className="paper-intro">{t(`inbox.view.paper.${intro}`)}</p>

        <table className="paper-table">
          <thead>
            <tr>
              <th scope="col">{t("inbox.view.paper.colName")}</th>
              <th scope="col" className="paper-qty">{t("inbox.view.paper.colQty")}</th>
              <th scope="col">{t("inbox.view.paper.colReason")}</th>
            </tr>
          </thead>
          <tbody>
            {lines === null ? (
              <tr><td colSpan={3} className="muted" role="status">{t("inbox.view.loading")}</td></tr>
            ) : (
              lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.name}</td>
                  <td className="paper-qty">{fmtNum(l.qty, locale)}</td>
                  <td>{l.reason}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <table className="paper-stamps">
          <thead>
            <tr>{stampRoles.map((r) => <th key={r} scope="col">{t(`roles.${r}`)}</th>)}</tr>
          </thead>
          <tbody>
            <tr>
              {stampRoles.map((r) => (
                <td key={r}>
                  {route.filter((s) => s.role === r).map((s) => <Stamp key={s.stepNo} step={s} />)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

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

/** Một bước trong ô ký: chỉ người đã xử lý (xong / trả lại) mới có tên + ngày; người chưa xử lý để trống như đơn giấy chưa ký */
function Stamp({ step }: { step: RouteStep }) {
  if (step.status !== "DONE" && step.status !== "RETURNED") return null;
  return (
    <div className="stamp" data-status={step.status}>
      <div>{step.assigneeName ?? step.assignee}</div>
      <div>{fmtStampDate(step.actedAt)}</div>
    </div>
  );
}
