"use client";

import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { InboxRow } from "@/lib/store";
import BulkActDialog from "./BulkActDialog";

type Ctx = {
  selected: ReadonlyMap<number, InboxRow>;
  /** Các việc xử lý được trên trang hiện tại (do InboxRows đăng ký) */
  pageRows: readonly InboxRow[];
  toggle: (row: InboxRow) => void;
  toggleAll: () => void;
  clear: () => void;
  setPageRows: (rows: readonly InboxRow[]) => void;
};

const SelectionContext = createContext<Ctx | null>(null);

export function useInboxSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useInboxSelection phải nằm trong <InboxSelection>");
  return ctx;
}

/** Giữ danh sách việc đang tích chọn, dùng chung cho đầu bảng (chọn tất cả), các dòng và thanh thao tác hàng loạt */
export function InboxSelection({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<ReadonlyMap<number, InboxRow>>(new Map());
  const [pageRows, setPageRowsState] = useState<readonly InboxRow[]>([]);

  const toggle = useCallback((row: InboxRow) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (!next.delete(row.id)) next.set(row.id, row);
      return next;
    });
  }, []);
  const toggleAll = useCallback(() => {
    setSelected((prev) => (pageRows.length > 0 && pageRows.every((r) => prev.has(r.id)) ? new Map() : new Map(pageRows.map((r) => [r.id, r]))));
  }, [pageRows]);
  const clear = useCallback(() => setSelected(new Map()), []);
  const setPageRows = useCallback((rows: readonly InboxRow[]) => {
    setPageRowsState(rows);
    // Dữ liệu đổi (sau khi xử lý / làm mới / đổi trang): chỉ giữ những việc còn xử lý được
    setSelected((prev) => {
      const ids = new Set(rows.map((r) => r.id));
      const next = new Map([...prev].filter(([id]) => ids.has(id)).map(([id]) => [id, rows.find((r) => r.id === id)!] as const));
      return next.size === prev.size ? prev : next;
    });
  }, []);

  const value = useMemo(() => ({ selected, pageRows, toggle, toggleAll, clear, setPageRows }), [selected, pageRows, toggle, toggleAll, clear, setPageRows]);
  return (
    <SelectionContext.Provider value={value}>
      {children}
      <BulkBar />
    </SelectionContext.Provider>
  );
}

/** Đặt ở trạng thái "không có dòng nào" để bỏ các lựa chọn cũ */
export function ResetSelection() {
  const { setPageRows } = useInboxSelection();
  useEffect(() => setPageRows([]), [setPageRows]);
  return null;
}

/** Ô tiêu đề cột chọn: chọn / bỏ chọn tất cả việc xử lý được trên trang */
export function SelectAllTh() {
  const t = useTranslations("inbox.bulk");
  const { selected, pageRows, toggleAll } = useInboxSelection();
  const ref = useRef<HTMLInputElement>(null);
  const count = pageRows.filter((r) => selected.has(r.id)).length;
  const all = pageRows.length > 0 && count === pageRows.length;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = count > 0 && !all;
  }, [count, all]);
  return (
    <th scope="col" className="col-check">
      <input ref={ref} type="checkbox" checked={all} disabled={pageRows.length === 0} onChange={toggleAll} aria-label={t("selectAll")} />
    </th>
  );
}

/** Thanh thao tác hàng loạt — nổi ở đáy màn hình khi có việc được chọn */
function BulkBar() {
  const t = useTranslations("inbox.bulk");
  const { selected, clear } = useInboxSelection();
  const [acting, setActing] = useState<"approve" | "return" | null>(null);
  const rows = useMemo(() => [...selected.values()], [selected]);

  return (
    <>
      {rows.length > 0 && (
        <div className="bulk-bar" role="region" aria-label={t("label")}>
          <span className="strong">{t("selected", { count: rows.length })}</span>
          <button type="button" className="btn btn-sm" onClick={clear}>{t("clear")}</button>
          <span className="bulk-spacer" />
          <button type="button" className="btn btn-sm btn-danger" onClick={() => setActing("return")}>{t("returnAll")}</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setActing("approve")}>{t("approveAll")}</button>
        </div>
      )}
      {acting && <BulkActDialog rows={rows} action={acting} onClose={() => setActing(null)} onDone={clear} />}
    </>
  );
}
