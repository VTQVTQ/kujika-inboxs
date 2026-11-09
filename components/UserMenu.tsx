"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { LOCALES, type Locale } from "@/i18n/config";
import { setLocaleAction } from "@/lib/actions";
import FeedbackDialog, { FeedbackIcon } from "./FeedbackDialog";

const LOCALE_LABEL: Record<Locale, string> = { vi: "Tiếng Việt", ja: "日本語" };

/** Nút ba chấm dọc cạnh tên người dùng: sổ danh sách tùy chọn (Ý kiến & góp ý — hộp thoại có thêm tab "Xem góp ý" cho dev-admin; chọn ngôn ngữ) */
export default function UserMenu({ max, isFeedbackAdmin, locale }: { max: number; isFeedbackAdmin: boolean; locale: Locale }) {
  const t = useTranslations("feedback");
  const tm = useTranslations("userMenu");
  const tc = useTranslations("common");
  const [pendingLocale, startLocale] = useTransition();
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    wrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(wrapRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div className="user-menu" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-icon"
        aria-label={tm("label")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {open && (
        <div id={menuId} className="menu-pop" role="menu" aria-label={tm("label")} onKeyDown={onMenuKeyDown}>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              setDialogOpen(true);
            }}
          >
            <FeedbackIcon />
            {t("form.title")}
          </button>
          <div className="menu-sep" role="separator" />
          <div role="group" aria-label={tc("language")}>
            <p className="menu-group-label" aria-hidden="true">{tc("language")}</p>
            {LOCALES.map((l) => (
              <button
                key={l}
                type="button"
                role="menuitemradio"
                aria-checked={l === locale}
                className="menu-item menu-radio"
                disabled={pendingLocale}
                onClick={() => {
                  setOpen(false);
                  startLocale(() => setLocaleAction(l));
                }}
              >
                <span className="menu-check" aria-hidden="true">{l === locale ? "✓" : ""}</span>
                {LOCALE_LABEL[l]}
              </button>
            ))}
          </div>
        </div>
      )}
      {dialogOpen && <FeedbackDialog max={max} isAdmin={isFeedbackAdmin} onClose={() => { setDialogOpen(false); buttonRef.current?.focus(); }} />}
    </div>
  );
}
