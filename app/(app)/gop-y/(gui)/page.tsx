import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import FeedbackForm from "@/components/FeedbackForm";
import { FEEDBACK_MAX } from "@/lib/feedback";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("feedback.meta"))("send") };
}

/** Gửi góp ý — mọi người dùng đã đăng nhập; cố ý không có trên menu / không gắn link ở đâu, chỉ vào bằng đúng URL */
export default function FeedbackPage() {
  return <FeedbackForm max={FEEDBACK_MAX} />;
}
