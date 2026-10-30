"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { actOnItemAction } from "@/lib/actions";
import type { InboxRow } from "@/lib/store";

/** Giới hạn độ dài ý kiến / lý do (khớp lib/actions.ts) */
const COMMENT_MAX = 500;

type Failure = { row: InboxRow; error: string };

/**
 * Hộp thoại xác nhận / phê duyệt / trả lại nhiều việc cùng lúc. Xử lý lần lượt từng việc qua cùng server action
 * của xử lý từng dòng (quyền do hệ thống nguồn kiểm tra); việc lỗi được liệt kê, việc thành công không phải làm lại.
 */
export default function BulkActDialog({ rows, action, onClose, onDone }: { rows: InboxRow[]; action: "approve" | "return"; onClose: () => void; onDone: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  // Chốt danh sách lúc mở: làm mới nền không làm đổi những việc đang xử lý
  const [items, setItems] = useState(rows);
  const [comment, setComment] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failures, setFailures] = useState<Failure[] | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const isReturn = action === "return";
  const label = isReturn ? t("inbox.act.returnBtn") : t("inbox.bulk.approveAll");
  const missingReason = isReturn && !comment.trim();

  const submit = async () => {
    setRunning(true);
    setFailures(null);
    setProgress(0);
    const failed: Failure[] = [];
    for (const row of items) {
      try {
        const res = await actOnItemAction(row.id, action, comment);
        if (!res.ok) failed.push({ row, error: res.error });
      } catch {
        failed.push({ row, error: t("inbox.act.failed") });
      }
      setProgress((p) => p + 1);
    }
    setRunning(false);
    router.refresh();
    if (failed.length === 0) {
      onDone();
      ref.current?.close();
      return;
    }
    // Giữ lại các việc lỗi để thử lại; việc đã xong thì bỏ khỏi danh sách
    const failedIds = new Set(failed.map((f) => f.row.id));
    setItems((prev) => prev.filter((r) => failedIds.has(r.id)));
    setFailures(failed);
  };

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="bulk-title"
      onClose={onClose}
      onCancel={(e) => {
        if (running) e.preventDefault();
      }}
    >
      <div className="modal-head">
        <h2 id="bulk-title">{t("inbox.bulk.dialogTitle", { action: label, count: items.length })}</h2>
      </div>
      <div className="modal-body">
        <ul className="bulk-list">
          {items.map((r) => (
            <li key={r.id}>
              <span className="mono small">{r.code}</span> <span>{r.title}</span>
            </li>
          ))}
        </ul>
        <label className="field-label" htmlFor="bulk-comment">{isReturn ? t("inbox.act.reasonLabel") : t("inbox.act.commentOptional")}</label>
        <textarea id="bulk-comment" className="textarea" maxLength={COMMENT_MAX} value={comment} disabled={running} onChange={(e) => setComment(e.target.value)} />
        {running && <p className="muted" role="status">{t("inbox.bulk.progress", { done: progress, total: items.length })}</p>}
        {failures && (
          <div className="form-error" role="alert">
            <p>{t("inbox.bulk.someFailed", { count: failures.length })}</p>
            <ul className="bulk-list">
              {failures.map((f) => (
                <li key={f.row.id}>
                  <span className="mono small">{f.row.code}</span>: {f.error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="modal-foot">
        <button type="button" className="btn" disabled={running} onClick={() => ref.current?.close()}>{t("common.close")}</button>
        <button type="button" className={`btn ${isReturn ? "btn-danger" : "btn-primary"}`} disabled={running || missingReason || items.length === 0} aria-busy={running} onClick={submit}>
          {running ? t("inbox.act.processing") : failures ? t("inbox.bulk.retry") : label}
        </button>
      </div>
    </dialog>
  );
}
