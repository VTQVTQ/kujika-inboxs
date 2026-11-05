"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type Ref } from "react";
import type { InboxSearch } from "@/lib/store";
import { useInboxSelection } from "./InboxSelection";

const PATH = "/viec-can-xu-ly";
const FIELDS = [
  { name: "code", label: "inbox.searchForm.code" },
  { name: "title", label: "inbox.searchForm.title" },
  { name: "requester", label: "inbox.searchForm.requester" },
] as const;
const EMPTY: InboxSearch = { code: "", title: "", requester: "" };

/**
 * Khung điều kiện tìm kiếm (Mã đề nghị, Nội dung đề nghị, Người đề nghị) + Xóa / Tìm kiếm.
 * Tìm kiếm: đưa điều kiện lên URL (server tìm, về trang 1, giữ tab / hệ thống / số dòng / sắp xếp).
 * Xóa: về trạng thái khởi tạo của màn hình (URL gốc, bỏ cả ô lọc nhanh).
 */
export function SearchPanel({ values, keep }: { values: InboxSearch; keep: Record<string, string> }) {
  const t = useTranslations();
  const router = useRouter();
  const { setQuick } = useInboxSelection();
  const [form, setForm] = useState<InboxSearch>(values);
  // Điều kiện trên URL đổi (tìm / xóa / quay lại trình duyệt) → ô nhập hiện đúng điều kiện đang áp dụng
  const { code, title, requester } = values;
  useEffect(() => setForm({ code, title, requester }), [code, title, requester]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams(keep);
    for (const f of FIELDS) {
      const v = form[f.name].trim();
      if (v) p.set(f.name, v);
    }
    const s = p.toString();
    router.push(s ? `${PATH}?${s}` : PATH, { scroll: false });
  };
  const clear = () => {
    setForm(EMPTY);
    setQuick("");
    router.push(PATH, { scroll: false });
  };

  // Mép trái nút Xóa thẳng mép trái nút Xem trên lưới: cột Thao tác rộng theo nội dung (đổi theo ngôn ngữ, thanh cuộn của bảng)
  // nên đo vị trí nút Xem ở dòng đầu rồi nới nhóm nút sang trái (hai nút vẫn rộng bằng nhau; không nhỏ hơn cỡ tự nhiên — min-width ở CSS)
  const actionsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const actions = actionsRef.current;
    // Bảng ngay sau khung tìm kiếm này (không lấy theo cả trang: lúc chuyển trang có thể còn bản dựng khác của màn hình)
    const wrap = actions?.closest(".search-panel")?.nextElementSibling?.querySelector(".table-wrap");
    if (!actions || !wrap) return;
    const ro = new ResizeObserver(() => schedule());
    let watched: Element | null = null;
    let frame = 0;
    // Ô lọc nhanh ở hàng tab rộng gấp đôi nhóm nút Xóa + khoảng cách + Tìm kiếm (biến CSS trên khung bảng)
    const card = wrap.closest<HTMLElement>(".card");
    const sizeQuick = () => {
      const next = `${actions.getBoundingClientRect().width * 2}px`;
      if (card && card.style.getPropertyValue("--quick-w") !== next) card.style.setProperty("--quick-w", next);
    };
    const align = () => {
      frame = 0;
      const view = wrap.querySelector<HTMLElement>("tbody .btn-stack .btn");
      // Đang chờ dữ liệu / không có dòng: giữ độ rộng cũ để nút không nhảy qua lại
      if (!view) return sizeQuick();
      // Theo dõi ô Thao tác của dòng đầu: cột đổi bề rộng (đổi ngôn ngữ, dữ liệu) thì nút Xem dời chỗ mà khung bảng không đổi cỡ
      const cell = view.closest("td") ?? view;
      if (watched !== cell) {
        if (watched) ro.unobserve(watched);
        ro.observe(cell);
        watched = cell;
      }
      // Màn hẹp, bảng cuộn ngang: nút Xem có thể khuất ngoài khung → dùng cỡ tự nhiên
      const scrolls = wrap.scrollWidth > wrap.clientWidth + 1;
      const width = actions.getBoundingClientRect().right - view.getBoundingClientRect().left;
      const next = !scrolls && width > 0 ? `${width}px` : "";
      if (actions.style.width !== next) actions.style.width = next;
      sizeQuick();
    };
    // Gộp nhiều thay đổi liên tiếp thành một lần đo (setTimeout thay vì requestAnimationFrame: vẫn chạy khi tab ở nền)
    const schedule = () => {
      if (!frame) frame = window.setTimeout(align, 0);
    };
    align();
    const form = actions.parentElement ?? actions;
    ro.observe(wrap);
    ro.observe(form);
    // Dữ liệu trên lưới / chữ trên nút đổi (đổi trang / tab / lọc nhanh / ngôn ngữ) mà khung không đổi cỡ
    const mo = new MutationObserver(schedule);
    mo.observe(wrap, { childList: true, subtree: true, characterData: true });
    mo.observe(form, { childList: true, subtree: true, characterData: true });
    return () => {
      clearTimeout(frame);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <SearchPanelView
      form={form}
      actionsRef={actionsRef}
      onChange={(name, v) => setForm((f) => ({ ...f, [name]: v }))}
      onSubmit={submit}
      onClear={clear}
      label={t("inbox.searchForm.label")}
    />
  );
}

/** Khung chờ (loading.tsx): cùng bố cục / chiều cao với khung thật, ô nhập và nút bị khóa */
export function SearchPanelSkeleton() {
  const t = useTranslations();
  return <SearchPanelView form={EMPTY} label={t("inbox.searchForm.label")} disabled />;
}

function SearchPanelView({
  form,
  label,
  disabled,
  onChange,
  onSubmit,
  onClear,
  actionsRef,
}: {
  form: InboxSearch;
  label: string;
  disabled?: boolean;
  actionsRef?: Ref<HTMLDivElement>;
  onChange?: (name: keyof InboxSearch, v: string) => void;
  onSubmit?: (e: FormEvent) => void;
  onClear?: () => void;
}) {
  const t = useTranslations();
  return (
    <form className="card search-panel" role="search" aria-label={label} onSubmit={onSubmit} aria-busy={disabled || undefined}>
      {FIELDS.map((f) => (
        <label key={f.name} className="search-field">
          <span className="search-field-label">{t(f.label)}</span>
          <input className="input" type="text" name={f.name} maxLength={100} value={form[f.name]} disabled={disabled} onChange={(e) => onChange?.(f.name, e.target.value)} />
        </label>
      ))}
      {/* Xóa / Tìm kiếm rộng bằng nhau (lưới 2 cột 1fr co theo nút rộng hơn) */}
      <div ref={actionsRef} className="search-actions">
        <button type="button" className="btn" disabled={disabled} onClick={onClear}>{t("inbox.searchForm.clear")}</button>
        <button type="submit" className="btn btn-primary" disabled={disabled}>{t("inbox.searchForm.submit")}</button>
      </div>
    </form>
  );
}

/** Ô lọc nhanh ở hàng tab: chỉ lọc các dòng đang có trên lưới, không gọi server */
export function QuickFilter() {
  const t = useTranslations("inbox.search");
  const { quick, setQuick } = useInboxSelection();
  return (
    <div className="search">
      <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input className="input search-input" type="search" value={quick} onChange={(e) => setQuick(e.target.value)} aria-label={t("label")} placeholder={t("placeholder")} />
    </div>
  );
}
