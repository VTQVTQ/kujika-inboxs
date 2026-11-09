"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SEND_PATH = "/gop-y";
const MINE_PATH = "/gop-y/cua-toi";

/** Hai tab của hòm thư góp ý: Gửi góp ý / Góp ý của tôi (mỗi tab một trang riêng nên có khung chờ riêng) */
export default function FeedbackTabs() {
  const t = useTranslations("feedback.tabs");
  // usePathname không kèm basePath
  const pathname = usePathname();
  const onMine = pathname === MINE_PATH || pathname.startsWith(`${MINE_PATH}/`);
  return (
    <div className="tabbar">
      <nav className="tabs" aria-label={t("label")}>
        <Link href={SEND_PATH} className="tab" aria-current={onMine ? undefined : "page"} scroll={false}>{t("send")}</Link>
        <Link href={MINE_PATH} className="tab" aria-current={onMine ? "page" : undefined} scroll={false}>{t("mine")}</Link>
      </nav>
    </div>
  );
}
