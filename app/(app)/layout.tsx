import { getLocale, getTranslations } from "next-intl/server";
import DevUserSwitcher from "@/components/DevUserSwitcher";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { isLocale } from "@/i18n/config";
import { getCurrentUser } from "@/lib/auth";
import { getAuthProvider } from "@/lib/auth-identity";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, t, locale] = await Promise.all([getCurrentUser(), getTranslations("meta"), getLocale()]);
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">{t("appTitle")}</span>
        <div className="topbar-end">
          {getAuthProvider() === "dev" && <DevUserSwitcher account={user.account} />}
          {isLocale(locale) && <LocaleSwitcher locale={locale} />}
          <span className="user-chip">{user.display}</span>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
