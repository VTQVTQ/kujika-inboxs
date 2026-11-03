"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/** ok = thành công (viền xanh lá), warn = một phần chưa xong (vàng cam), error = lỗi (đỏ). Huy hiệu bên trái: ✓ / ! / ✕ */
type ToastKind = "ok" | "warn" | "error";
type Toast = { id: number; text: string; kind: ToastKind };
type ToastItem = Toast & { life: number; leaving: boolean };

const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

/** Thời gian hiện (ms) — cảnh báo / lỗi cần đọc kỹ hơn nên hiện lâu hơn */
const LIFE_OK = 4500;
const LIFE_LONG = 7000;
/** Khớp thời lượng animation .toast.is-leaving trong globals.css */
const EXIT_MS = 180;
/** Số toast tối đa cùng lúc (toast cũ nhất bị thay) */
const MAX_VISIBLE = 3;

const BADGE: Record<ToastKind, string> = { ok: "✓", warn: "!", error: "✕" };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const tc = useTranslations("common");
  const [items, setItems] = useState<ToastItem[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // Đóng: chạy hiệu ứng rời đi rồi mới gỡ khỏi danh sách
  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), EXIT_MS);
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = Date.now() + Math.random();
      const life = t.kind === "ok" ? LIFE_OK : LIFE_LONG;
      setItems((xs) => [...xs.slice(-(MAX_VISIBLE - 1)), { ...t, id, life, leaving: false }]);
      setTimeout(() => dismiss(id), life);
    },
    [dismiss],
  );

  // Hộp thoại mở bằng showModal() nằm ở "top layer" và che mọi thứ bên dưới; popover cũng ở top layer
  // và được hiện SAU nên nằm trên hộp thoại → toast lỗi / cảnh báo thấy được ngay cả khi hộp thoại còn mở
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof el.showPopover !== "function") return;
    if (el.matches(":popover-open")) el.hidePopover();
    if (items.length > 0) el.showPopover();
  }, [items]);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div ref={listRef} className="toasts" popover="manual" role="status" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={`toast is-${t.kind}${t.leaving ? " is-leaving" : ""}`}
            style={{ "--toast-life": `${t.life}ms` } as React.CSSProperties}
          >
            <span className="toast-text">
              <span className="toast-badge" aria-hidden="true">{BADGE[t.kind]}</span>
              <span>{t.text}</span>
            </span>
            <button type="button" className="toast-close" aria-label={tc("closeToast")} onClick={() => dismiss(t.id)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
