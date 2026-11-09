/** Cột của bảng "Góp ý của tôi" (ngày gửi + nội dung) — nguồn chung cho khung chờ trong trang (Suspense) và khung chờ cả trang (loading.tsx) */
export const COLUMNS = [
  { id: "sent", label: "feedback.mine.colSent", sk: "date" },
  { id: "content", label: "feedback.mine.colContent", sk: "lines" },
] as const;
