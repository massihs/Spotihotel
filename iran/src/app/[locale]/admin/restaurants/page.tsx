import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { requireSuperAdmin } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { listRestaurantsForAdmin } from "@/server/modules/admin/service";
import { grantPlanAction, setRestaurantStatusAction } from "../actions";
import { adminListPlans, subscriptionsByOrganization } from "@/server/modules/billing/service";

export default function AdminRestaurantsPage({ searchParams }: PageProps<"/[locale]/admin/restaurants">) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <RestaurantsTable searchParams={searchParams} />
    </Suspense>
  );
}

async function RestaurantsTable({
  searchParams,
}: {
  searchParams: PageProps<"/[locale]/admin/restaurants">["searchParams"];
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined;
  const status = sp.status === "active" || sp.status === "suspended" ? sp.status : undefined;
  const [t, tc, format, rows, plans] = await Promise.all([
    getTranslations("admin"),
    getTranslations("common"),
    getFormatter(),
    listRestaurantsForAdmin(db, { q, status }),
    adminListPlans(db),
  ]);
  const subs = await subscriptionsByOrganization(
    db,
    rows.map((r) => r.organizationId),
  );
  const subLine = (orgId: string) => {
    const s = subs.get(orgId);
    if (!s || s.kind === "free") return t("plans.stateFree");
    const d = (x: Date) => format.dateTime(x, { dateStyle: "medium" });
    if (s.kind === "trial") return t("plans.stateTrial", { plan: s.planName, date: d(s.endsAt) });
    if (s.kind === "expired") return t("plans.stateExpired", { plan: s.planName, date: d(s.endedAt) });
    return s.endsAt ? t("plans.statePaid", { plan: s.planName, date: d(s.endsAt) }) : s.planName;
  };

  return (
    <>
      <PageHeader title={t("restaurants.title")} />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <Input
          name="q"
          defaultValue={q}
          placeholder={t("restaurants.searchPlaceholder")}
          className="max-w-xs"
          aria-label={t("restaurants.searchPlaceholder")}
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-11 rounded-xl border border-border bg-surface px-3 text-sm"
          aria-label={t("restaurants.all")}
        >
          <option value="">{t("restaurants.all")}</option>
          <option value="active">{t("status.active")}</option>
          <option value="suspended">{t("status.suspended")}</option>
        </select>
        <Button type="submit" variant="secondary" className="h-11">
          {tc("search")}
        </Button>
      </form>
      {rows.length === 0 ? (
        <Card className="px-6 py-12 text-center text-fg-muted">{t("restaurants.empty")}</Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className="flex h-full flex-col gap-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/dashboard/${r.id}`} className="min-w-0 hover:underline">
                    <p className="truncate font-semibold">{r.name}</p>
                    <p className="truncate text-xs text-fg-subtle">
                      {r.organizationName} · /{r.slug} ·{" "}
                      {format.dateTime(r.createdAt, { dateStyle: "medium" })}
                    </p>
                  </Link>
                  <Badge tone={r.status === "active" ? "success" : "danger"}>{t(`status.${r.status}`)}</Badge>
                </div>
                <p className="text-sm">
                  <span className="text-fg-muted">{t("plans.current")}</span> {subLine(r.organizationId)}
                </p>
                <details className="rounded-xl bg-surface-2 p-3 text-sm">
                  <summary className="cursor-pointer font-medium">{t("plans.grant")}</summary>
                  <form action={grantPlanAction} className="mt-3 grid gap-2 sm:grid-cols-3">
                    <input type="hidden" name="restaurantId" value={r.id} />
                    <select
                      name="planCode"
                      className="h-10 rounded-lg border border-border bg-surface px-2"
                      aria-label={t("plans.title")}
                    >
                      {plans.map((p) => (
                        <option key={p.id} value={p.code}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <select
                      name="months"
                      defaultValue="1"
                      className="h-10 rounded-lg border border-border bg-surface px-2"
                      aria-label={t("plans.months")}
                    >
                      <option value="0">{t("plans.noEnd")}</option>
                      {[1, 3, 6, 12].map((m) => (
                        <option key={m} value={m}>
                          {t("plans.monthsN", { count: m })}
                        </option>
                      ))}
                    </select>
                    <Input
                      name="amount"
                      inputMode="numeric"
                      placeholder={t("plans.amount")}
                      className="h-10"
                    />
                    <Button type="submit" size="sm" variant="secondary" className="sm:col-span-3">
                      {t("plans.apply")}
                    </Button>
                  </form>
                </details>
                <div className="mt-auto flex items-center gap-2">
                  <span className="text-sm text-fg-muted">
                    {t("restaurants.orders")}{" "}
                    <span className="font-semibold text-fg tabular-nums">{r.ordersCount}</span>
                  </span>
                  <form action={setRestaurantStatusAction} className="ms-auto">
                    <input type="hidden" name="restaurantId" value={r.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={r.status === "active" ? "suspended" : "active"}
                    />
                    <Button type="submit" size="sm" variant={r.status === "active" ? "ghost" : "secondary"}>
                      {r.status === "active" ? t("restaurants.suspend") : t("restaurants.reactivate")}
                    </Button>
                  </form>
                  <Link href={`/dashboard/${r.id}`} className={buttonClasses("primary", "sm")}>
                    {t("restaurants.open")}
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
