"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState, useTransition } from "react";
import { sendFeedbackAction } from "@/lib/feedback-actions";
import { useToast } from "./Toast";

/** Form gửi góp ý: một ô nội dung + nút Gửi. Người gửi do server xác định, form chỉ gửi nội dung */
export default function FeedbackForm({ max }: { max: number }) {
  const t = useTranslations("feedback.form");
  const toast = useToast();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await sendFeedbackAction(content);
      if (result.ok) {
        setContent("");
        toast({ kind: "ok", text: result.message });
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <FeedbackFormView
      value={content}
      max={max}
      error={error}
      pending={pending}
      disabled={false}
      onChange={(v) => {
        setContent(v);
        setError(null);
      }}
      onSubmit={submit}
      sendLabel={t("submit")}
    />
  );
}

/** Khung chờ (loading.tsx): cùng bố cục / chiều cao với form thật, ô nhập và nút bị khóa */
export function FeedbackFormSkeleton({ max }: { max: number }) {
  const t = useTranslations("feedback.form");
  return <FeedbackFormView value="" max={max} error={null} pending={false} disabled sendLabel={t("submit")} />;
}

function FeedbackFormView({
  value,
  max,
  error,
  pending,
  disabled,
  onChange,
  onSubmit,
  sendLabel,
}: {
  value: string;
  max: number;
  error: string | null;
  pending: boolean;
  disabled: boolean;
  onChange?: (v: string) => void;
  onSubmit?: (e: FormEvent) => void;
  sendLabel: string;
}) {
  const t = useTranslations("feedback.form");
  const id = useId();
  const countId = `${id}-count`;
  const errorId = `${id}-error`;
  return (
    <form onSubmit={onSubmit} className="feedback-form" aria-busy={disabled || pending || undefined}>
      <label className="field-label" htmlFor={id}>{t("label")}</label>
      <textarea
        id={id}
        className="textarea feedback-textarea"
        value={value}
        maxLength={max}
        required
        disabled={disabled || pending}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${countId} ${errorId}` : countId}
        onChange={(e) => onChange?.(e.target.value)}
      />
      <div className="feedback-foot">
        <span id={countId} className="feedback-count">{t("counter", { count: [...value].length, max })}</span>
        <button type="submit" className="btn btn-primary" disabled={disabled || pending || value.trim() === ""} aria-busy={pending}>
          {sendLabel}
        </button>
      </div>
      {/* Chỗ báo lỗi giữ sẵn một dòng cao (CSS) để form không giật khi lỗi hiện / mất */}
      <p id={errorId} className="form-error feedback-error" role="alert">{error}</p>
    </form>
  );
}
