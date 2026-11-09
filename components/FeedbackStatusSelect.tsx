"use client";

import { useEffect, useState, useTransition } from "react";
import { updateFeedbackStatusAction } from "@/lib/feedback-actions";
import { useToast } from "./Toast";

/** Ô đổi trạng thái của một góp ý (màn Xem góp ý, chỉ dev-admin). Server kiểm tra lại quyền; lỗi thì trả về giá trị cũ */
export default function FeedbackStatusSelect({ id, status, options, label }: { id: number; status: string; options: { value: string; label: string }[]; label: string }) {
  const toast = useToast();
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
        toast({ kind: "ok", text: result.message });
      } else {
        setValue(previous);
        toast({ kind: "error", text: result.error });
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
