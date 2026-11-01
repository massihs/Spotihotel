import {
  Activity,
  CalendarDays,
  CirclePause,
  ReceiptText,
  Sparkles,
  Store,
  TrendingDown,
  Users,
  Wallet,
} from "lucide-react";
import { edition } from "@/config/edition";
import { formatMoney } from "@/lib/money";
import { Suspense } from "react";
import { getTranslations, getLocale } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { requireSuperAdmin } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getGrowthMetrics, getPlatformStats } from "@/server/modules/admin/service";
import { DayBars, lastDays } from "@/components/dashboard/day-bars";
import { Link } from "@/i18n/navigation";
import { getFormatter } from "next-intl/server";

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <AdminOverview />
    </Suspense>
  );
}

async function AdminOverview() {
  await requireSuperAdmin();
  const [t, stats, growth, format] = await Promise.all([
    getTranslations("admin"),
    getPlatformStats(db),
    getGrowthMetrics(db),
    getFormatter(),
  ]);
  const locale = await getLocale();
  const plans = Object.entries(stats.subscriptionsByPlan);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label={t("stats.activeRestaurants")}
          value={stats.restaurants.active}
          icon={<Store />}
          tone="emerald"
        />
        <StatCard
          label={t("stats.suspendedRestaurants")}
          value={stats.restaurants.suspended}
          icon={<CirclePause />}
          tone="rose"
        />
        <StatCard
          label={t("stats.newRestaurants")}
          value={stats.restaurants.new30d}
          icon={<Sparkles />}
          tone="amber"
        />
        <StatCard label={t("stats.users")} value={stats.users} icon={<Users />} tone="sky" />
        <StatCard label={t("stats.orders")} value={stats.orders} icon={<ReceiptText />} tone="orange" />
        <StatCard
          label={t("stats.revenue")}
          value={formatMoney(stats.revenueCents, edition.platformCurrency, locale)}
          icon={<Wallet />}
          tone="gradient"
        />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("growth.active7d")} value={growth.active7d} icon={<Activity />} tone="teal" />
        <StatCard
          label={t("growth.active30d")}
          value={growth.active30d}
          icon={<CalendarDays />}
          tone="indigo"
        />
        <StatCard
          label={t("growth.lost30d")}
          value={growth.lost30d}
          hint={t("growth.lostHint")}
          icon={<TrendingDown />}
          tone="fuchsia"
        />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("growth.ordersPerDay")} />
          <div className="p-5">
            <DayBars
              data={lastDays(growth.byDay, 30, (r) => r.orders)}
              label={(v) => t("growth.orders", { count: v })}
              locale={locale}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title={t("growth.restaurantsPerDay")} />
          <div className="p-5">
            <DayBars
              data={lastDays(growth.byDay, 30, (r) => r.restaurants)}
              label={(v) => t("growth.restaurants", { count: v })}
              locale={locale}
            />
          </div>
        </Card>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("growth.signups")} />
          <ul className="divide-y divide-border">
            {growth.signups.length === 0 ? <li className="px-5 py-4 text-sm text-fg-muted">—</li> : null}
            {growth.signups.map((w) => (
              <li key={w.week} className="flex justify-between px-5 py-2.5 text-sm">
                <span>
                  {t("growth.weekOf", { date: format.dateTime(new Date(w.week), { dateStyle: "medium" }) })}
                </span>
                <span className="font-semibold tabular-nums">{w.n}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title={t("growth.atRisk")} description={t("growth.atRiskHint")} />
          <ul className="divide-y divide-border">
            {growth.atRisk.length === 0 ? (
              <li className="px-5 py-4 text-sm text-fg-muted">{t("growth.noRisk")}</li>
            ) : null}
            {growth.atRisk.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <Link href={`/dashboard/${r.id}`} className="font-medium hover:underline">
                  {r.name}
                </Link>
                <span className="text-fg-muted">
                  {t("growth.lastOrder", { time: format.relativeTime(r.lastOrderAt) })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title={t("subscriptions")} />
        <ul className="divide-y divide-border">
          {plans.length === 0 ? <li className="px-5 py-4 text-sm text-fg-muted">—</li> : null}
          {plans.map(([plan, n]) => (
            <li key={plan} className="flex justify-between px-5 py-3 text-sm">
              <span className="font-medium capitalize">{plan}</span>
              <span className="text-fg-muted tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
