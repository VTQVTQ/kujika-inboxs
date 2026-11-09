/** Các cột của bảng góp ý — nguồn chung cho đầu bảng thật, khung chờ trong trang (Suspense) và khung chờ cả trang (loading.tsx) */
export const COLUMNS = [
  { id: "sent", label: "feedback.view.colSent", sk: "date" },
  { id: "sender", label: "feedback.view.colSender", sk: "text" },
  { id: "content", label: "feedback.view.colContent", sk: "lines" },
  { id: "status", label: "feedback.view.colStatus", sk: "pill" },
  { id: "handled", label: "feedback.view.colHandled", sk: "textSub" },
] as const;
