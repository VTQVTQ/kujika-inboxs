import { getLocale, getTranslations } from "next-intl/server";
import DevUserSwitcher from "@/components/DevUserSwitcher";
import { ToastProvider } from "@/components/Toast";
import UserMenu from "@/components/UserMenu";
import { isLocale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/auth";
import { getAuthProvider } from "@/lib/auth-identity";
import { FEEDBACK_MAX, isFeedbackAdmin } from "@/lib/feedback";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, t, locale] = await Promise.all([getCurrentUser(), getTranslations("meta"), getLocale()]);
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">{t("appTitle")}</span>
        <div className="topbar-end">
          {getAuthProvider() === "dev" && <DevUserSwitcher account={user.account} />}
          <span className="user-chip">{user.display}</span>
          {isLocale(locale) && <UserMenu max={FEEDBACK_MAX} isFeedbackAdmin={isFeedbackAdmin(user.account)} locale={locale} />}
        </div>
      </header>
      <ToastProvider>
        <main className="content">{children}</main>
      </ToastProvider>
    </div>
  );
}
