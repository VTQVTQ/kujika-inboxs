"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { isLocale } from "@/i18n/config";
import { actOnItemAction } from "@/lib/actions";
import type { InboxRow } from "@/lib/store";

/** Giới hạn độ dài ý kiến / lý do (khớp lib/actions.ts) */
const COMMENT_MAX = 500;

/**
 * Hộp thoại xác nhận Xác nhận / Phê duyệt / Trả lại một việc. Quyền và trạng thái do hệ thống nguồn kiểm tra
 * (người bấm là tài khoản domain đang đăng nhập); lỗi hiện ngay trong hộp thoại, thành công thì đóng và làm mới danh sách.
 */
export default function ActDialog({ row, action, onClose }: { row: InboxRow; action: "approve" | "return"; onClose: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const localeRaw = useLocale();
  const locale = isLocale(localeRaw) ? localeRaw : "vi";
  const ref = useRef<HTMLDialogElement>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const isReturn = action === "return";
  const label = isReturn ? t("inbox.act.returnBtn") : t(`roles.${row.role}`);
  const missingReason = isReturn && !comment.trim();

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await actOnItemAction(row.id, action, comment);
      if (res.ok) {
        ref.current?.close();
        router.refresh();
      } else {
        setError(res.error);
        // Việc đã đổi ở hệ thống gốc: danh sách phía sau hộp thoại cũng được làm mới
        router.refresh();
      }
    });

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="act-title"
      onClose={onClose}
      onCancel={(e) => {
        // Đang gửi: không đóng bằng Esc để không mất kết quả
        if (pending) e.preventDefault();
      }}
    >
      <div className="modal-head">
        <h2 id="act-title">{t("inbox.act.dialogTitle", { action: label, code: row.code })}</h2>
        <p className="muted">{row.systemName[locale]}</p>
      </div>
      <div className="modal-body">
        <p className="strong">{row.title}</p>
        <label className="field-label" htmlFor="act-comment">{isReturn ? t("inbox.act.reasonLabel") : t("inbox.act.commentOptional")}</label>
        <textarea
          id="act-comment"
          className="textarea"
          maxLength={COMMENT_MAX}
          value={comment}
          disabled={pending}
          aria-invalid={error !== null || undefined}
          onChange={(e) => setComment(e.target.value)}
        />
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <div className="modal-foot">
        <button type="button" className="btn" disabled={pending} onClick={() => ref.current?.close()}>{t("common.close")}</button>
        <button type="button" className={`btn ${isReturn ? "btn-danger" : "btn-primary"}`} disabled={pending || missingReason} aria-busy={pending} onClick={submit}>
          {pending ? t("inbox.act.processing") : label}
        </button>
      </div>
    </dialog>
  );
}
