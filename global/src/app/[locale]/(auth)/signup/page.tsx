import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SignupForm } from "../auth-forms";

export const metadata: Metadata = { robots: { index: false } };

export default async function SignupPage({ params }: PageProps<"/[locale]/signup">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("signupTitle")}</h1>
      <p className="mt-1.5 text-fg-muted">{t("signupSubtitle")}</p>
      <div className="mt-8">
        <SignupForm />
      </div>
      <p className="mt-6 text-center text-sm text-fg-muted">
        {t("hasAccount")}{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          {t("goLogin")}
        </Link>
      </p>
    </div>
  );
}
