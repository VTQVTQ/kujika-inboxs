"use client";

import { useTranslations } from "next-intl";
import { type KeyboardEvent, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import AllFeedbackList from "./AllFeedbackList";
import FeedbackForm from "./FeedbackForm";
import MyFeedbackList from "./MyFeedbackList";

/** Icon bong bóng chat (trang trí, tiêu đề đã có chữ) */
export function FeedbackIcon() {
  return (
    <svg className="feedback-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

type Tab = "send" | "mine" | "all";

/**
 * Hộp thoại giữa màn hình "Ý kiến & góp ý": tab Gửi góp ý / Góp ý của tôi (+ Xem góp ý cho dev-admin).
 * Chân hộp thoại dùng chung cho mọi tab (Hủy + Gửi ở tab gửi, Đóng ở các tab còn lại) nên chiều cao không đổi khi chuyển tab.
 * Thông báo kết quả hiện ngay trong hộp thoại (toast nằm dưới lớp modal).
 */
export default function FeedbackDialog({ max, isAdmin, onClose }: { max: number; isAdmin: boolean; onClose: () => void }) {
  const t = useTranslations("feedback");
  const tc = useTranslations("common");
  const formId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ send: null, mine: null, all: null });
  const [tab, setTab] = useState<Tab>("send");
  const [sending, setSending] = useState(false);
  const [empty, setEmpty] = useState(true);
  const onPendingChange = useCallback((p: boolean) => setSending(p), []);
  const onEmptyChange = useCallback((e: boolean) => setEmpty(e), []);
  /** Vị trí / bề rộng đường gạch dưới tab đang chọn (null = chưa đo, không chạy hiệu ứng trượt ở lần vẽ đầu) */
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[tab];
      if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [tab, isAdmin]);
  const tabs: { id: Tab; label: string }[] = [
    { id: "send", label: t("tabs.send") },
    { id: "mine", label: t("tabs.mine") },
    ...(isAdmin ? [{ id: "all" as const, label: t("tabs.all") }] : []),
  ];

  /** Bàn phím cho tab: ←/→ chuyển tab (vòng tròn), Home/End về đầu/cuối; chỉ tab đang chọn nằm trong thứ tự Tab */
  const onTabKeyDown = (e: KeyboardEvent) => {
    const i = tabs.findIndex((x) => x.id === tab);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    const target = tabs[next].id;
    setTab(target);
    tabRefs.current[target]?.focus();
  };

  return (
    <dialog ref={ref} className="modal modal-feedback" aria-labelledby="feedback-title" onClose={onClose}>
      <div className="modal-head feedback-head">
        <h2 id="feedback-title"><FeedbackIcon />{t("form.title")}</h2>
      </div>
      <div className="tabbar">
        <div className="tabs" role="tablist" aria-label={t("tabs.label")} onKeyDown={onTabKeyDown}>
          {tabs.map((x) => (
            <button
              key={x.id}
              ref={(el) => {
                tabRefs.current[x.id] = el;
              }}
              type="button"
              role="tab"
              id={`feedback-tab-${x.id}`}
              className="tab"
              aria-selected={tab === x.id}
              aria-controls="feedback-panel"
              tabIndex={tab === x.id ? 0 : -1}
              onClick={() => setTab(x.id)}
            >
              {x.label}
            </button>
          ))}
          {indicator && <span className="tab-indicator" aria-hidden="true" style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }} />}
        </div>
      </div>
      <div id="feedback-panel" role="tabpanel" aria-labelledby={`feedback-tab-${tab}`} className="feedback-panel">
        {/* Form luôn nằm trong cây (chỉ ẩn khi sang tab khác) để nội dung đang gõ không bị mất khi chuyển tab */}
        <FeedbackForm max={max} formId={formId} hidden={tab !== "send"} onPendingChange={onPendingChange} onEmptyChange={onEmptyChange} />
        {tab === "mine" && <MyFeedbackList />}
        {tab === "all" && <AllFeedbackList />}
      </div>
      <div className="modal-foot">
        {tab === "send" ? (
          <>
            <button type="button" className="btn feedback-btn" disabled={sending} onClick={() => ref.current?.close()}>{t("form.cancel")}</button>
            <button type="submit" form={formId} className="btn btn-primary feedback-btn" disabled={sending || empty} aria-busy={sending}>{t("form.submit")}</button>
          </>
        ) : (
          <button type="button" className="btn feedback-btn" onClick={() => ref.current?.close()}>{tc("close")}</button>
        )}
      </div>
    </dialog>
  );
}
