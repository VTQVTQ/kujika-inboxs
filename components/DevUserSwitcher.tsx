"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { switchUserAction } from "@/lib/actions";

/** Chỉ hiện ở dev: gõ tài khoản AD để xem hộp việc của người đó */
export default function DevUserSwitcher({ account }: { account: string }) {
  const t = useTranslations("common");
  const [value, setValue] = useState(account);
  const [pending, start] = useTransition();
  return (
    <form
      className="dev-user"
      onSubmit={(e) => {
        e.preventDefault();
        start(() => switchUserAction(value));
      }}
    >
      <label htmlFor="dev-user-input" className="sr-only">{t("devUser")}</label>
      <input id="dev-user-input" className="input input-sm" value={value} maxLength={100} onChange={(e) => setValue(e.target.value)} placeholder={t("devUser")} />
      <button type="submit" className="btn btn-sm" disabled={pending}>{t("devUserApply")}</button>
    </form>
  );
}
