import { getTranslations } from "next-intl/server";
import FeedbackTabs from "@/components/FeedbackTabs";

/** Khung chung của hòm thư góp ý (tiêu đề + tab): giữ nguyên khi chuyển tab, chỉ phần thân (form / danh sách) đổi và có khung chờ riêng */
export default async function FeedbackLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("feedback.form");
  return (
    <section className="card feedback-card" aria-labelledby="feedback-title">
      <h1 id="feedback-title" className="feedback-title">{t("title")}</h1>
      <FeedbackTabs />
      {children}
    </section>
  );
}
