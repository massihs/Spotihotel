import { Check, CreditCard, FileText, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { buttonClasses } from "@/components/ui/button";
import { edition } from "@/config/edition";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db/client";
import { TRIAL_DAYS, billingEnabled, listPublicPlans } from "@/server/modules/billing/service";
import { planFeatureLines } from "@/server/modules/billing/features";

type Props = PageProps<"/[locale]/pricing">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricing" });
  return { title: { absolute: t("metaTitle") }, description: t("subtitle") };
}

export default async function PricingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pricing");
  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader active="pricing" />
      <main className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[26rem] bg-gradient-to-b from-accent-soft/80 to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute start-1/2 -top-40 size-[36rem] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-4 pt-14 pb-20 sm:px-6 sm:pt-20">
          <p className="mx-auto w-fit rounded-full bg-surface px-3.5 py-1 text-xs font-bold text-accent-text shadow-[var(--shadow-soft)] ring-1 ring-border">
            {t("eyebrow")}
          </p>
          <h1 className="mt-4 text-center text-3xl font-black tracking-tight text-balance sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-center text-base text-pretty text-fg-muted sm:text-lg">
            {t("subtitle")}
          </p>
          <Suspense fallback={<div className="mt-12 h-96 animate-pulse rounded-3xl bg-surface-2" />}>
            <Plans />
          </Suspense>
          <p className="mt-10 text-center text-sm text-fg-muted">{t("yearly")}</p>
          <TrustStrip />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

async function Plans() {
  // Plans live in the database (Admin > Plans): read at request time.
  await connection();
  const [t, tb, locale, plans] = await Promise.all([
    getTranslations("pricing"),
    getTranslations("billing"),
    getLocale(),
    listPublicPlans(db),
  ]);
  const trial = billingEnabled();
  const highlight = "professional";
  return (
    <>
      {trial ? (
        <p className="mx-auto mt-6 w-fit rounded-full bg-accent-soft px-4 py-1.5 text-sm font-semibold text-accent-text">
          {t("trial", { days: TRIAL_DAYS })}
        </p>
      ) : null}
      {/* Phones: plans side by side to swipe, the recommended one first. */}
      <ul className="mt-10 flex snap-x snap-mandatory [scrollbar-width:none] gap-4 overflow-x-auto py-3 max-sm:-mx-4 max-sm:px-4 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:py-0 lg:grid-cols-4">
        {plans.map((p) => {
          const hot = p.code === highlight;
          const custom = p.priceMonthlyCents === 0 && p.code !== "free";
          return (
            <li
              key={p.id}
              className={cn(
                "relative flex w-[82%] shrink-0 snap-center flex-col rounded-3xl bg-surface p-6 shadow-[var(--shadow-soft)] ring-1 ring-border transition-transform hover:-translate-y-1 sm:w-auto",
                hot && "max-sm:order-first",
                hot &&
                  "bg-[#1c1917] text-white shadow-[0_30px_70px_-30px_rgb(234_88_12/0.65)] ring-0 lg:-my-3 lg:py-9",
              )}
            >
              {hot ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-6 -top-px h-px bg-gradient-to-r from-transparent via-accent to-transparent"
                />
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold">{p.name}</h2>
                {hot ? (
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-accent-fg">
                    {t("popular")}
                  </span>
                ) : null}
              </div>
              <p className="mt-4">
                {custom ? (
                  <span className="text-2xl font-bold">{t("onQuote")}</span>
                ) : p.priceMonthlyCents === 0 ? (
                  <span className="text-3xl font-bold">{t("free")}</span>
                ) : (
                  <>
                    <span className="text-3xl font-bold tabular-nums">
                      {formatMoney(p.priceMonthlyCents, edition.platformCurrency, locale)}
                    </span>{" "}
                    <span className={cn("text-sm", hot ? "text-white/60" : "text-fg-muted")}>
                      {tb("perMonth")}
                    </span>
                  </>
                )}
              </p>
              <ul
                className={cn(
                  "mt-6 flex-1 space-y-2.5 border-t pt-6 text-sm",
                  hot ? "border-white/10" : "border-border",
                )}
              >
                {planFeatureLines(p.limits, tb).map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                        hot ? "bg-accent text-accent-fg" : "bg-success-soft text-success",
                      )}
                    >
                      <Check className="size-3" aria-hidden="true" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={custom ? "/#contact" : "/signup"}
                className={cn(buttonClasses(hot ? "accent" : "secondary", "lg"), "mt-7 w-full")}
              >
                {custom ? t("contact") : t("start")}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

async function TrustStrip() {
  const t = await getTranslations("landing");
  const items = [
    { Icon: Smartphone, text: t("trust.noApp") },
    { Icon: CreditCard, text: t("trust.zarinpal") },
    { Icon: FileText, text: t("trust.invoice") },
  ];
  return (
    <ul className="mx-auto mt-12 grid max-w-3xl gap-3 sm:grid-cols-3">
      {items.map(({ Icon, text }) => (
        <li
          key={text}
          className="flex items-center gap-3 rounded-2xl bg-surface p-4 text-sm font-semibold shadow-[var(--shadow-soft)] ring-1 ring-border"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          {text}
        </li>
      ))}
    </ul>
  );
}
