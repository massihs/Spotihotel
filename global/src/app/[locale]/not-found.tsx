import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  const t = useTranslations("errors");
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="mt-2 text-2xl font-semibold">{t("notFoundTitle")}</h1>
      <p className="mt-2 text-fg-muted">{t("notFoundBody")}</p>
      <Link href="/" className={buttonClasses("secondary", "md", "mt-6 w-fit")}>
        {t("home")}
      </Link>
    </div>
  );
}
