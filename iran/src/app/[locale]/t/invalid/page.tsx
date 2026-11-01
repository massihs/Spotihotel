import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

export const metadata: Metadata = { robots: { index: false } };

export default async function InvalidQrPage({ params }: PageProps<"/[locale]/t/invalid">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("guest");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="grid size-16 place-items-center rounded-2xl bg-surface-2 text-2xl" aria-hidden="true">
        ⌁
      </div>
      <h1 className="mt-5 text-xl font-semibold">{t("unavailableTitle")}</h1>
      <p className="mt-2 text-fg-muted">{t("unavailableBody")}</p>
    </main>
  );
}
