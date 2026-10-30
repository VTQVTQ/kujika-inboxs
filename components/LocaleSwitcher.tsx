"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { LOCALES, type Locale } from "@/i18n/config";
import { setLocaleAction } from "@/lib/actions";

const LABEL: Record<Locale, string> = { vi: "VI", ja: "日本語" };

export default function LocaleSwitcher({ locale }: { locale: Locale }) {
  const t = useTranslations("common");
  const [pending, start] = useTransition();
  return (
    <div className="seg" role="group" aria-label={t("language")}>
      {LOCALES.map((l) => (
        <button key={l} type="button" className="seg-btn" aria-pressed={l === locale} disabled={pending} onClick={() => start(() => setLocaleAction(l))}>
          {LABEL[l]}
        </button>
      ))}
    </div>
  );
}
