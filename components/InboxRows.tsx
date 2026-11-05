"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { COLUMNS } from "@/app/(app)/viec-can-xu-ly/columns";
import { isLocale } from "@/i18n/config";
import { fmtDate, fmtNum } from "@/lib/format";
import type { InboxRow } from "@/lib/store";
import ActDialog from "./ActDialog";
import { useInboxSelection } from "./InboxSelection";
import InboxViewDialog from "./InboxViewDialog";

const norm = (s: string) => s.normalize("NFC").toLocaleLowerCase();

/** Thân bảng việc cần xử lý. Nhấp đúp vào dòng (hoặc nút Xem) mở hộp thoại xem nhanh; "Mở" đưa sang hệ thống gốc ở tab mới */
export default function InboxRows({ rows }: { rows: InboxRow[] }) {
  const t = useTranslations();
  const localeRaw = useLocale();
  const locale = isLocale(localeRaw) ? localeRaw : "vi";
  const [viewing, setViewing] = useState<InboxRow | null>(null);
  const [acting, setActing] = useState<{ row: InboxRow; action: "approve" | "return" } | null>(null);

  const { selected, toggle, setPageRows, quick } = useInboxSelection();

  // Lọc nhanh trên lưới: so khớp (không phân biệt hoa thường) với chữ đang hiện ở các cột của dòng
  const visible = useMemo(() => {
    const needle = norm(quick.trim());
    if (!needle) return rows;
    return rows.filter((r) =>
      norm(
        [
          r.systemName[locale],
          r.code,
          r.title,
          t(`priority.${r.priority}`),
          r.requesterName,
          fmtDate(r.submittedAt, locale),
          t(`roles.${r.role}`),
          r.status !== "PENDING" ? `${t(`inbox.status.${r.status}`)} ${fmtDate(r.actedAt, locale)}` : "",
        ].join("\n"),
      ).includes(needle),
    );
  }, [rows, quick, locale, t]);

  // Chọn tất cả / thao tác hàng loạt chỉ áp dụng cho các dòng đang hiện
  useEffect(() => {
    setPageRows(visible.filter((r) => r.canAct));
  }, [visible, setPageRows]);

  return (
    <>
      <tbody>
        {visible.length === 0 && (
          <tr>
            <td colSpan={COLUMNS.length} className="empty">
              <strong>{t("inbox.empty.noneFiltered")}</strong>
              <span className="muted">{t("inbox.empty.quickHint")}</span>
            </td>
          </tr>
        )}
        {visible.map((r) => (
          <tr key={r.id} className="row-action" title={t("common.dblHint")} aria-selected={selected.has(r.id) || undefined} onDoubleClick={() => setViewing(r)}>
            <td className="col-check" onDoubleClick={(e) => e.stopPropagation()}>
              {r.canAct && <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r)} aria-label={t("inbox.bulk.selectRow", { code: r.code })} />}
            </td>
            <td>
              <div className="strong nowrap">{r.systemName[locale]}</div>
              <div className="mono muted small nowrap">{r.code}</div>
            </td>
            <td>
              <div className="cell-clip strong" title={r.title}>{r.title}</div>
              {r.lineCount !== null && r.totalQty !== null && (
                <div className="muted small">{t("inbox.table.lineSummary", { lines: fmtNum(r.lineCount, locale), qty: fmtNum(r.totalQty, locale) })}</div>
              )}
            </td>
            <td className="nowrap"><span className={`pill pill-${r.priority.toLowerCase()}`}>{t(`priority.${r.priority}`)}</span></td>
            <td className="nowrap">{r.requesterName}</td>
            <td className="nowrap">{fmtDate(r.submittedAt, locale)}</td>
            <td>
              {/* Vai trò không xuống dòng; dòng "Đã xử lý · ngày" (tab Tôi đã xử lý) được xuống dòng để bảng không phải cuộn ngang */}
              <div className="nowrap">{t(`roles.${r.role}`)}</div>
              {r.status !== "PENDING" && <div className="muted small">{t(`inbox.status.${r.status}`)} · {fmtDate(r.actedAt, locale)}</div>}
            </td>
            <td className="right nowrap">
              {/* Hàng trên: Xem + Mở ở hệ thống gốc; hàng dưới (chỉ việc xử lý được): Trả lại + Xác nhận / Phê duyệt, rộng bằng nhau và bằng hàng trên */}
              <div className="btn-stack">
                <div className="btn-row nowrap">
                  <button type="button" className="btn btn-sm" onClick={() => setViewing(r)}>{t("common.view")}</button>
                  <a className={`btn btn-sm${r.status === "PENDING" && !r.canAct ? " btn-primary" : ""}`} href={r.href} target="_blank" rel="noreferrer">
                    {t("common.openOriginal")}
                    <span aria-hidden="true"> ↗</span>
                  </a>
                </div>
                {r.canAct && (
                  <div className="btn-pair">
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => setActing({ row: r, action: "return" })}>{t("inbox.act.returnBtn")}</button>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => setActing({ row: r, action: "approve" })}>{t(`roles.${r.role}`)}</button>
                  </div>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
      {/* Hộp thoại đưa ra document.body: <dialog> không được nằm trong <table> (lỗi hydration). Chỉ render sau khi bấm nên không có ở bản render server */}
      {viewing &&
        createPortal(
          <InboxViewDialog
            row={viewing}
            onClose={() => setViewing(null)}
            onAct={(action) => {
              setViewing(null);
              setActing({ row: viewing, action });
            }}
          />,
          document.body,
        )}
      {acting && createPortal(<ActDialog row={acting.row} action={acting.action} onClose={() => setActing(null)} />, document.body)}
    </>
  );
}
