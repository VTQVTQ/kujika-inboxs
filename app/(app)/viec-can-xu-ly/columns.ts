import type { InboxTab } from "@/lib/store";

export const TABS: InboxTab[] = ["todo", "done"];

/** Các cột của bảng — nguồn chung cho đầu bảng thật, khung chờ trong trang (Suspense) và khung chờ cả trang (loading.tsx) */
export const COLUMNS = [
  { id: "select", sk: "check" },
  { id: "code", label: "inbox.table.colCode", sort: "code", sk: "codeSub" },
  { id: "content", label: "inbox.table.colContent", sk: "lines" },
  { id: "priority", label: "inbox.table.colPriority", sort: "priority", sk: "pill" },
  { id: "requester", label: "inbox.table.colRequester", sk: "text" },
  { id: "submitted", label: "inbox.table.colSubmitted", sort: "submitted", sk: "date" },
  { id: "task", label: "inbox.table.colTask", sk: "textSub" },
  { id: "actions", label: "inbox.table.colActions", sk: "button", right: true },
] as const;
