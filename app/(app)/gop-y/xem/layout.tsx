import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isFeedbackAdmin } from "@/lib/feedback";

/**
 * Chỉ dev-admin (FEEDBACK_ADMINS) xem được. Kiểm tra ở layout để người khác nhận 404 NGAY, trước cả khung chờ (loading.tsx)
 * — không lộ trang tồn tại; trang và server action vẫn kiểm tra lại (layout không chạy lại khi chuyển giữa các trang con).
 */
export default async function FeedbackViewLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!isFeedbackAdmin(user.account)) notFound();
  return children;
}
