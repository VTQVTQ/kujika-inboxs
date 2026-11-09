"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useId, useState, useTransition } from "react";
import { sendFeedbackAction } from "@/lib/feedback-actions";

type Notice = { kind: "ok" | "error"; text: string } | null;

/**
 * Form gửi góp ý: một ô nhập (nhãn dạng legend) + bộ đếm ký tự. Nút Hủy / Gửi nằm ở chân hộp thoại (nút Gửi gắn vào form qua thuộc tính `form`),
 * nên form báo lên trạng thái đang gửi (onPendingChange) và nội dung đang trống (onEmptyChange) để khóa nút. Server vẫn kiểm tra nội dung trống.
 * Kết quả hiện ngay dưới form (nằm trong hộp thoại nên không dùng toast).
 */
export default function FeedbackForm({
  max,
  formId,
  onPendingChange,
  onEmptyChange,
}: {
  max: number;
  formId: string;
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
    <form id={formId} onSubmit={submit} noValidate className="feedback-form" aria-busy={pending || undefined}>
      <fieldset className="feedback-field" data-invalid={error ? true : undefined}>
        <legend id={`${id}-legend`}>{t("label")}</legend>
        <textarea
          id={id}
          className="feedback-textarea"
          value={content}
          maxLength={max}
          disabled={pending}
          aria-labelledby={`${id}-legend`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${countId} ${noticeId}` : countId}
          onChange={(e) => {
            setContent(e.target.value);
            setNotice(null);
          }}
        />
        <span id={countId} className="feedback-count">{t("counter", { count: [...content].length, max })}</span>
      </fieldset>
      {/* Chỗ báo kết quả giữ sẵn một dòng cao (CSS) để hộp thoại không giật khi hiện / mất */}
      <p id={noticeId} className={`feedback-notice ${notice?.kind === "ok" ? "feedback-ok" : "form-error"}`} role={error ? "alert" : "status"}>{notice?.text}</p>
    </form>
  );
}
