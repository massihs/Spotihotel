import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Gem, ReceiptText } from "@/components/icons";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { getBillingView } from "@/server/modules/billing/service";
import { planFeatureLines } from "@/server/modules/billing/features";
import { Checkout } from "./checkout";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/billing">;

export default function BillingPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Billing {...props} />
    </Suspense>
  );
}

async function Billing({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(restaurantId, "restaurant.view");
  const [t, format, view, locale] = await Promise.all([
    getTranslations("billing"),
    getFormatter(),
    getBillingView(db, ctx),
    getLocale(),
  ]);
  const money = (c: number, cur: string) => formatMoney(c, cur, locale);
  const date = (d: Date) => format.dateTime(d, { dateStyle: "long", timeZone: ctx.restaurant.timezone });
  const s = view.state;

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      {sp.paid ? (
        <p
          role="status"
          className="mb-4 rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success"
        >
          {t("paidOk")}
        </p>
      ) : sp.failed ? (
        <p role="alert" className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {t("paidFailed")}
        </p>
      ) : null}
      <div className="grid items-start gap-6 xl:max-w-5xl">
        <Card
          className="relative isolate overflow-hidden border-transparent p-5 text-white shadow-accent sm:p-6"
          style={{ background: "var(--brand-gradient)" }}
        >
          <span
            aria-hidden="true"
            className="texture-khatam texture-fade-corner [--tex-color:white] [--tex-opacity:0.12] [--tex-size:64px]"
          />
          <div className="relative flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <Gem className="size-6" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white/75">{t("current")}</p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <p className="text-2xl font-bold">{s.kind === "free" ? t("freePlan") : s.planName}</p>
                {s.kind === "trial" ? <Badge tone="accent">{t("trialBadge")}</Badge> : null}
                {s.kind === "expired" ? <Badge tone="danger">{t("expiredBadge")}</Badge> : null}
                {s.kind === "paid" ? <Badge tone="success">{t("activeBadge")}</Badge> : null}
              </div>
              <p className="mt-2 text-sm text-white/80">
                {s.kind === "trial"
                  ? t("trialUntil", { date: date(s.endsAt), days: s.daysLeft })
                  : s.kind === "paid"
                    ? s.endsAt
                      ? t("paidUntil", { date: date(s.endsAt), days: s.daysLeft ?? 0 })
                      : t("noEnd")
                    : s.kind === "expired"
                      ? t("expiredSince", { date: date(s.endedAt) })
                      : t("freeBody")}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("choose")} description={view.enabled ? t("chooseHint") : t("disabledHint")} />
          <div className="p-5 sm:p-6">
            {view.enabled ? (
              <Checkout
                restaurantId={ctx.restaurant.id}
                currency={view.currency}
                currentPlan={s.kind === "free" ? null : s.planCode}
                canPay={can(ctx, "restaurant.manage")}
                plans={view.plans.map((p) => ({
                  code: p.code,
                  name: p.name,
                  priceMonthlyCents: p.priceMonthlyCents,
                  features: planFeatureLines(p.limits, t),
                }))}
              />
            ) : (
              <p className="text-sm">
                {t("disabledBody")}{" "}
                <Link href="/pricing" className="font-semibold text-accent-text underline">
                  {t("seePricing")}
                </Link>
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={t("history")} />
          {view.history.length === 0 ? (
            <div className="p-4 sm:p-5">
              <Empty size="sm" icon={<ReceiptText aria-hidden="true" />}>
                {t("historyEmpty")}
              </Empty>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {view.history.map((h) => (
                <li
                  key={h.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm sm:px-6"
                >
                  <div>
                    <p className="font-medium">
                      {h.planName} | {t("months", { count: h.months })}
                    </p>
                    <p className="text-fg-muted">
                      {date(h.paidAt ?? h.createdAt)}
                      {h.periodEnd ? ` → ${date(h.periodEnd)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">{money(h.amountCents, h.currency)}</span>
                    {h.status === "paid" && h.invoiceNumber ? (
                      <Link
                        href={`/dashboard/${ctx.restaurant.id}/billing/invoices/${h.id}`}
                        className="font-semibold text-accent-text underline"
                      >
                        {h.invoiceNumber}
                      </Link>
                    ) : (
                      <Badge tone="danger">{t("failed")}</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
