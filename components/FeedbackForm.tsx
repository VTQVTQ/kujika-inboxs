"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useId, useState, useTransition } from "react";
import { sendFeedbackAction } from "@/lib/feedback-actions";

type Notice = { kind: "ok" | "error"; text: string } | null;

/**
 * Form gửi góp ý: một ô nhập (nhãn nổi: placeholder khi trống, thu nhỏ lên viền khi focus / có chữ) + bộ đếm ký tự. Nút Hủy / Gửi nằm ở chân hộp thoại (nút Gửi gắn vào form qua thuộc tính `form`),
 * nên form báo lên trạng thái đang gửi (onPendingChange) và nội dung đang trống (onEmptyChange) để khóa nút. Server vẫn kiểm tra nội dung trống.
 * Kết quả hiện ngay dưới form (nằm trong hộp thoại nên không dùng toast).
 */
export default function FeedbackForm({
  max,
  formId,
  hidden,
  onPendingChange,
  onEmptyChange,
}: {
  max: number;
  formId: string;
  /** Ẩn form (tab khác đang mở) nhưng giữ nguyên nội dung đang gõ */
  hidden: boolean;
  onPendingChange: (pending: boolean) => void;
  onEmptyChange: (empty: boolean) => void;
}) {
  const t = useTranslations("feedback.form");
  const id = useId();
  const countId = `${id}-count`;
  const noticeId = `${id}-notice`;
  const [content, setContent] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, startTransition] = useTransition();
  const error = notice?.kind === "error";
  const empty = content.trim() === "";

  useEffect(() => onPendingChange(pending), [pending, onPendingChange]);
  useEffect(() => onEmptyChange(empty), [empty, onEmptyChange]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    startTransition(async () => {
      const result = await sendFeedbackAction(content);
      if (result.ok) {
        setContent("");
        setNotice({ kind: "ok", text: result.message });
      } else {
        setNotice({ kind: "error", text: result.error });
      }
    });
  };

  return (
    <form id={formId} onSubmit={submit} noValidate hidden={hidden} className="feedback-form" aria-busy={pending || undefined}>
      <div className="feedback-field" data-invalid={error ? true : undefined} data-filled={empty ? undefined : true}>
        <textarea
          id={id}
          className="feedback-textarea"
          value={content}
          maxLength={max}
          disabled={pending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${countId} ${noticeId}` : countId}
          onChange={(e) => {
            setContent(e.target.value);
            setNotice(null);
          }}
        />
        {/* Nhãn nổi: nằm trong ô như placeholder, khi focus hoặc đã có chữ thì thu nhỏ và trượt lên viền (CSS) */}
        <label htmlFor={id} className="feedback-label">{t("label")}</label>
        <span id={countId} className="feedback-count">{t("counter", { count: [...content].length, max })}</span>
      </div>
      {/* Chỗ báo kết quả giữ sẵn một dòng cao (CSS) để hộp thoại không giật khi hiện / mất */}
      <p id={noticeId} className={`feedback-notice ${notice?.kind === "ok" ? "feedback-ok" : "form-error"}`} role={error ? "alert" : "status"}>{notice?.text}</p>
    </form>
  );
}
