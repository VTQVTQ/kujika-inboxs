import { getTranslations } from "next-intl/server";

export default async function DeniedPage() {
  const t = await getTranslations("denied");
  return (
    <main className="denied">
      <h1>{t("title")}</h1>
      <p>{t("message")}</p>
    </main>
  );
}
