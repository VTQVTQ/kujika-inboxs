"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { isLocale } from "@/i18n/config";
import { fmtDate, fmtNum } from "@/lib/format";
import type { InboxRow } from "@/lib/store";
import ActDialog from "./ActDialog";
import { useInboxSelection } from "./InboxSelection";
import InboxViewDialog from "./InboxViewDialog";

/** Thân bảng việc cần xử lý. Nhấp đúp vào dòng (hoặc nút Xem) mở hộp thoại xem nhanh; "Mở" đưa sang hệ thống gốc ở tab mới */
export default function InboxRows({ rows }: { rows: InboxRow[] }) {
  const t = useTranslations();
  const localeRaw = useLocale();
  const locale = isLocale(localeRaw) ? localeRaw : "vi";
  const [viewing, setViewing] = useState<InboxRow | null>(null);
  const [acting, setActing] = useState<{ row: InboxRow; action: "approve" | "return" } | null>(null);

  const { selected, toggle, setPageRows } = useInboxSelection();
  useEffect(() => {
    setPageRows(rows.filter((r) => r.canAct));
  }, [rows, setPageRows]);

  return (
    <>
      <tbody>
        {rows.map((r) => (
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
            <td>{r.requesterName}</td>
            <td className="nowrap">{fmtDate(r.submittedAt, locale)}</td>
            <td>
              <div>{t(`roles.${r.role}`)}</div>
              {r.status !== "PENDING" && <div className="muted small">{t(`inbox.status.${r.status}`)} · {fmtDate(r.actedAt, locale)}</div>}
            </td>
            <td className="right nowrap">
              <div className="btn-row">
                <button type="button" className="btn btn-sm" onClick={() => setViewing(r)}>{t("common.view")}</button>
                <a className={`btn btn-sm${r.status === "PENDING" && !r.canAct ? " btn-primary" : ""}`} href={r.href} target="_blank" rel="noreferrer">
                  {t("common.openOriginal")}
                  <span aria-hidden="true"> ↗</span>
                </a>
                {r.canAct && (
                  <>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => setActing({ row: r, action: "return" })}>{t("inbox.act.returnBtn")}</button>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => setActing({ row: r, action: "approve" })}>{t(`roles.${r.role}`)}</button>
                  </>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
      {viewing && (
        <InboxViewDialog
          row={viewing}
          onClose={() => setViewing(null)}
          onAct={(action) => {
            setViewing(null);
            setActing({ row: viewing, action });
          }}
        />
      )}
      {acting && <ActDialog row={acting.row} action={acting.action} onClose={() => setActing(null)} />}
    </>
  );
}
