import { FeedbackFormSkeleton } from "@/components/FeedbackForm";
import { FEEDBACK_MAX } from "@/lib/feedback";

/** Khung chờ phần thân: cùng form (ô nhập, nút bị khóa) như trang thật nên chiều cao không đổi khi tải xong; tiêu đề + tab ở layout nên không chờ */
export default function Loading() {
  return <FeedbackFormSkeleton max={FEEDBACK_MAX} />;
}
