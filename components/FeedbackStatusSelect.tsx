"use client";

import { useEffect, useState, useTransition } from "react";
import { updateFeedbackStatusAction } from "@/lib/feedback-actions";

export type FeedbackNotice = { kind: "ok" | "error"; text: string };

/**
 * Ô đổi trạng thái của một góp ý (tab Xem góp ý, chỉ dev-admin). Server kiểm tra lại quyền; lỗi thì trả về giá trị cũ.
 * Kết quả báo qua onNotice (hộp thoại tự hiện ngay trong khung vì toast nằm dưới lớp modal).
 */
export default function FeedbackStatusSelect({
  id,
  status,
  options,
  label,
  onNotice,
  onSaved,
}: {
  id: number;
  status: string;
  options: { value: string; label: string }[];
  label: string;
  onNotice: (notice: FeedbackNotice) => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();
  // Danh sách tải lại từ server (lọc, đổi trang, vừa lưu) → hiện đúng giá trị đang lưu
  useEffect(() => setValue(status), [status]);

  const change = (next: string) => {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await updateFeedbackStatusAction(id, next);
      if (result.ok) {
        onNotice({ kind: "ok", text: result.message });
        onSaved();
      } else {
        setValue(previous);
        onNotice({ kind: "error", text: result.error });
      }
    });
  };

  return (
    <select className="input input-sm feedback-status" value={value} disabled={pending} aria-label={label} aria-busy={pending || undefined} onChange={(e) => change(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
