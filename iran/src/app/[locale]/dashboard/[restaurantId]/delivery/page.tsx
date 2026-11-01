import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { CourierSettlement, DeliverySettings, DispatchBoard } from "@/components/delivery/delivery-ui";
import { LiveRefresh } from "@/components/realtime/live";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import {
  courierBalances,
  courierStats,
  listCouriers,
  listDeliveries,
  listZones,
} from "@/server/modules/delivery/service";
import { can } from "@/server/tenancy";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/delivery">;
const TABS = ["board", "settlement", "settings"] as const;

export default function DeliveryPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
      <Delivery params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

async function Delivery({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "orders.view");
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(String(sp.tab))
    ? (sp.tab as (typeof TABS)[number])
    : "board";
  const t = await getTranslations("delivery");
  const rid = ctx.restaurant.id;
  const base = `/dashboard/${rid}/delivery`;
  const cur = ctx.restaurant.currency;
  const [couriers, zones] = await Promise.all([listCouriers(db, ctx), listZones(db, ctx)]);

  return (
    <>
      <LiveRefresh types={["order.created", "order.updated", "payment.updated"]} />
      <PageHeader title={t("title")} description={t("subtitle")} />
      <nav
        className="-mx-4 mb-5 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4"
        aria-label={t("title")}
      >
        {TABS.map((k) => (
          <Link
            key={k}
            href={k === "board" ? base : `${base}?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap",
              tab === k ? "bg-accent text-accent-fg" : "bg-surface text-fg-muted ring-1 ring-border",
            )}
          >
            {t(`tabs.${k}`)}
          </Link>
        ))}
      </nav>

      {tab === "board"
        ? await (async () => {
            const b = await listDeliveries(db, ctx);
            const card = (r: (typeof b.toAssign)[number]) => ({
              ...r,
              placedAt: r.placedAt.toISOString(),
              dispatchedAt: iso(r.dispatchedAt),
              deliveredAt: iso(r.deliveredAt),
              courierSettledAt: iso(r.courierSettledAt),
            });
            return (
              <DispatchBoard
                rid={rid}
                currency={cur}
                couriers={couriers}
                board={{
                  toAssign: b.toAssign.map(card),
                  onTheRoad: b.onTheRoad.map(card),
                  delivered: b.delivered.map(card),
                }}
              />
            );
          })()
        : null}

      {tab === "settlement"
        ? await (async () => {
            const [balances, stats] = await Promise.all([courierBalances(db, ctx), courierStats(db, ctx, 7)]);
            return (
              <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
                <CourierSettlement rid={rid} currency={cur} balances={balances} />
                <Card>
                  <p className="border-b border-border px-4 py-3 font-semibold">{t("stats7d")}</p>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-fg-muted">
                      <tr>
                        <th className="px-4 py-2 text-start font-medium">{t("courier")}</th>
                        <th className="px-4 py-2 text-end font-medium">{t("deliveries")}</th>
                        <th className="px-4 py-2 text-end font-medium">{t("avgTrip")}</th>
                        <th className="px-4 py-2 text-end font-medium">{t("amount")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {stats.map((s) => (
                        <tr key={s.courierId}>
                          <td className="px-4 py-2 font-medium">{s.name}</td>
                          <td className="px-4 py-2 text-end tabular-nums">{s.deliveries}</td>
                          <td className="px-4 py-2 text-end tabular-nums">
                            {t("minutes", { count: s.avgMinutes })}
                          </td>
                          <td className="px-4 py-2 text-end font-semibold tabular-nums">
                            {formatMoney(s.totalCents, cur, "fa")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!stats.length ? <p className="py-8 text-center text-sm text-fg-subtle">—</p> : null}
                </Card>
              </div>
            );
          })()
        : null}

      {tab === "settings" ? (
        <DeliverySettings
          rid={rid}
          currency={cur}
          zones={zones}
          couriers={couriers}
          canManage={can(ctx, "restaurant.manage")}
        />
      ) : null}
    </>
  );
}
