import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/ui/logo";
import { buttonClasses } from "@/components/ui/button";

export default async function SuspendedPage({ params }: PageProps<"/[locale]/dashboard/suspended">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <div className="mx-auto max-w-lg px-5 py-12">
      <Logo />
      <h1 className="mt-10 text-xl font-semibold">{t("dashboard.suspendedTitle")}</h1>
      <p className="mt-2 text-fg-muted">{t("dashboard.suspendedBody")}</p>
      <Link href="/dashboard" className={buttonClasses("secondary", "md", "mt-6")}>
        {t("nav.myRestaurants")}
      </Link>
    </div>
  );
}
