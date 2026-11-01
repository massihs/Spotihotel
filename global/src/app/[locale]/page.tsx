import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { LanguageSwitcher } from "@/components/language-switcher";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing" });
  return { title: { absolute: t("metaTitle") }, description: t("metaDescription") };
}

const FEATURES = ["qr", "split", "live", "insights"] as const;

export default async function LandingPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-5 sm:px-8">
      <header className="flex items-center justify-between py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <LanguageSwitcher />
          <Link href="/login" className={buttonClasses("ghost", "sm")}>
            {t("ctaSecondary")}
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 flex-col justify-center py-16">
        <span className="w-fit rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
          {t("badge")}
        </span>
        <h1 className="mt-5 max-w-3xl text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
          {t("title")}
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-pretty text-fg-muted">{t("subtitle")}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup" className={buttonClasses("primary", "lg")}>
            {t("ctaPrimary")}
          </Link>
          <Link href="/login" className={buttonClasses("secondary", "lg")}>
            {t("ctaSecondary")}
          </Link>
        </div>

        <ul className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((key) => (
            <li key={key} className="rounded-2xl border border-border bg-surface p-5">
              <h2 className="font-semibold">{t(`features.${key}.title`)}</h2>
              <p className="mt-1.5 text-sm text-fg-muted">{t(`features.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </main>

      <footer className="py-8 text-sm text-fg-subtle">© Spotifood</footer>
    </div>
  );
}
