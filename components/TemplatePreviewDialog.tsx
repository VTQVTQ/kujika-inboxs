"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { getTemplatePreviewAction, type TemplatePreviewResult } from "@/lib/actions";
import type { InboxRow } from "@/lib/store";

/**
 * Kiểu tờ mẫu trong iframe (bảng tính do hệ thống nguồn dựng, ô cố định cỡ như Excel) — cùng quy tắc với "Xem mẫu trước" ở hệ thống kho:
 * nền trắng chữ đen như giấy in; chữ một dòng căn phải / giữa tràn sang hai bên như Excel.
 */
const SHEET_CSS = `
html,body{margin:0;background:#e9ebef}
.paper{width:fit-content;margin:16px auto;padding:24px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.15);overflow:hidden}
.xl-sheet{border-collapse:collapse;table-layout:fixed;background:#fff;color:#000;font-family:"Segoe UI","Noto Sans","Meiryo","メイリオ","Yu Gothic","游ゴシック","Noto Sans JP",sans-serif;font-size:11pt;line-height:1.25}
.xl-sheet td{padding:0 3px;border:0}
.xl-sheet .xl-nw{display:flex;white-space:pre}
`;

/**
 * Xem mẫu trước đề nghị (Excel của hệ thống nguồn, cùng mẫu với nút Xuất mẫu ở đó) + nút Xuất mẫu tải file.
 * Mẫu hiện trong iframe sandbox (không chạy script) → HTML của hệ thống khác không chạy mã trong trang hộp việc.
 * Tờ mẫu rộng hơn khung thì thu nhỏ cho vừa chiều ngang.
 */
export default function TemplatePreviewDialog({ row, onClose }: { row: InboxRow; onClose: () => void }) {
  const t = useTranslations();
  const ref = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [result, setResult] = useState<TemplatePreviewResult | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const load = useCallback(() => {
    setResult(null);
    getTemplatePreviewAction(row.id).then(setResult, () => setResult({ ok: false, error: t("inbox.template.failed") }));
  }, [row.id, t]);
  useEffect(load, [load]);

  // Vừa khung: thu nhỏ tờ mẫu theo bề rộng iframe, rồi đặt chiều cao iframe theo tờ mẫu (không có thanh cuộn thứ hai)
  const fit = useCallback(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    const paper = doc?.querySelector<HTMLElement>(".paper");
    const table = paper?.querySelector<HTMLElement>("table");
    if (!frame || !doc || !paper || !table) return;
    const pad = 48;
    const width = (parseFloat(table.style.width) || table.offsetWidth) + pad;
    const zoom = Math.min(1, (frame.clientWidth - 32) / width);
    doc.body.style.zoom = String(zoom);
    frame.style.height = `${Math.ceil(doc.documentElement.getBoundingClientRect().height * zoom) + 8}px`;
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !result?.ok) return;
    const ro = new ResizeObserver(fit);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [result, fit]);

  const srcDoc = result?.ok ? `<!doctype html><html><head><meta charset="utf-8"><style>${SHEET_CSS}</style></head><body><div class="paper">${result.html}</div></body></html>` : undefined;

  return (
    <dialog ref={ref} className="modal modal-tpl" aria-labelledby="tpl-preview-title" onClose={onClose}>
      <div className="modal-head">
        <h2 id="tpl-preview-title">{t("inbox.template.title", { code: row.code })}</h2>
        <p className="muted">{result?.ok ? `${result.fileName} · ${t("inbox.template.note")}` : t("inbox.template.note")}</p>
      </div>

      <div className="tpl-body" aria-busy={result === null}>
        {result === null ? (
          <div className="tpl-state" role="status">
            <span className="sk" style={{ width: "40%" }} />
            <span className="sk" style={{ width: "100%" }} />
            <span className="sk" style={{ width: "100%" }} />
            <span className="sk" style={{ width: "60%" }} />
            <span className="muted small">{t("inbox.template.loading")}</span>
          </div>
        ) : result.ok ? (
          <iframe ref={frameRef} className="tpl-frame" title={t("inbox.template.title", { code: row.code })} sandbox="allow-same-origin" srcDoc={srcDoc} onLoad={fit} />
        ) : (
          <div className="tpl-state tpl-error" role="alert">
            <span>{result.error}</span>
            <button type="button" className="btn btn-sm" onClick={load}>{t("inbox.template.retry")}</button>
          </div>
        )}
      </div>

      <div className="modal-foot">
        <div className="tpl-actions">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>{t("common.close")}</button>
          {result?.ok ? (
            <a className="btn btn-primary" href={`/viec-can-xu-ly/${row.id}/xuat-mau`} download>{t("inbox.template.download")}</a>
          ) : (
            <span className="btn btn-primary" aria-disabled="true">{t("inbox.template.download")}</span>
          )}
        </div>
      </div>
    </dialog>
  );
}
