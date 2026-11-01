import { edition } from "@/config/edition";
import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { requireSuperAdmin } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getPlatformStats } from "@/server/modules/admin/service";

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <AdminOverview />
    </Suspense>
  );
}

async function AdminOverview() {
  await requireSuperAdmin();
  const [t, format, stats] = await Promise.all([
    getTranslations("admin"),
    getFormatter(),
    getPlatformStats(db),
  ]);
  const plans = Object.entries(stats.subscriptionsByPlan);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label={t("stats.activeRestaurants")} value={stats.restaurants.active} />
        <StatCard label={t("stats.suspendedRestaurants")} value={stats.restaurants.suspended} />
        <StatCard label={t("stats.newRestaurants")} value={stats.restaurants.new30d} />
        <StatCard label={t("stats.users")} value={stats.users} />
        <StatCard label={t("stats.orders")} value={stats.orders} />
        <StatCard
          label={t("stats.revenue")}
          value={format.number(stats.revenueCents / 100, {
            style: "currency",
            currency: edition.platformCurrency,
          })}
        />
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
