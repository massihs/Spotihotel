import { ArrowRight, ShieldCheck } from "lucide-react";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { DinerLogin } from "@/components/account/diner-login";
import {
  CaloriesPanel,
  LogoutButton,
  PrivacyActions,
  ProfileForm,
} from "@/components/account/settings-forms";
import { bodyProfileOf } from "@/server/modules/diners/service";
import { Card, CardHeader } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { edition } from "@/config/edition";
import { getCurrentDiner } from "@/server/auth/diner";

type Props = PageProps<"/[locale]/account/settings">;

export default async function AccountSettingsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface" />}>
      <Settings locale={locale} />
    </Suspense>
  );
}

async function Settings({ locale }: { locale: string }) {
  const diner = await getCurrentDiner();
  if (!diner) redirect({ href: "/account", locale });
  const d = diner!;
  const t = await getTranslations("account");
  const tc = await getTranslations("calories");
  const body = bodyProfileOf(d);
  const sms = edition.edition === "iran" || edition.defaultLocale === "fa";
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/account"
          className="inline-flex items-center gap-1 text-sm font-medium text-fg-muted hover:text-fg"
        >
          <ArrowRight className="size-4 ltr:rotate-180" aria-hidden="true" />
          {t("back")}
        </Link>
        <div className="mt-2 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{t("settings")}</h1>
          <LogoutButton />
        </div>
      </div>

      <Card id="calories" className="scroll-mt-6">
        <CardHeader title={tc("panelTitle")} description={d.trackCalories ? tc("panelOn") : tc("panelOff")} />
        <div className="p-5">
          <CaloriesPanel
            tracking={Boolean(d.trackCalories)}
            initial={{
              sex: body?.sex ?? null,
              age: body?.age ?? null,
              weightKg: body?.weightKg ?? null,
              heightCm: body?.heightCm ?? null,
              activity: body?.activity ?? null,
              goal: body?.goal ?? null,
            }}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title={t("profile")} />
        <div className="p-5">
          <ProfileForm
            name={d.name}
            goals={d.goalsManual ? d.goals : null}
            placeholders={d.goals ?? undefined}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title={t("signInMethods")} />
        <div className="space-y-4 p-5 text-sm">
          <p>
            <span className="font-semibold">{t("mobile")}: </span>
            <span dir="ltr">{d.phone ?? "—"}</span>
            {d.phone ? (
              <span className="ms-2 inline-flex items-center gap-1 text-xs font-semibold text-success">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                {t("verified")}
              </span>
            ) : null}
          </p>
          <p>
            <span className="font-semibold">{t("email")}: </span>
            <span dir="ltr">{d.email ?? "—"}</span>
          </p>
          {!d.phone && sms ? (
            <div className="rounded-2xl bg-surface-2 p-4">
              <p className="mb-3 text-fg-muted">{t("addPhoneHint")}</p>
              <DinerLogin phoneOnly />
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader title={t("privacy")} description={t("privacyNote")} />
        <div className="p-5">
          <PrivacyActions />
        </div>
      </Card>
    </div>
  );
}
