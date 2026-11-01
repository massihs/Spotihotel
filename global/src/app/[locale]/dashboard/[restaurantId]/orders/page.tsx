import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { OrderCard } from "@/components/dashboard/order-card";
import { LiveRefresh } from "@/components/realtime/live";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { listActiveOrders } from "@/server/modules/orders/service";
import { ACTIVE_STATUSES } from "@/server/modules/orders/status";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/orders">;

export default function OrdersPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Orders params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Orders({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "orders.view");
  const sp = await searchParams;
  const view = sp.view === "done" ? "done" : "active";
  const [t, all] = await Promise.all([getTranslations("orders"), listActiveOrders(db, ctx)]);
  const active = all.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const done = all.filter((o) => !ACTIVE_STATUSES.includes(o.status)).reverse();
  const shown = view === "done" ? done : active;
  const base = `/dashboard/${ctx.restaurant.id}/orders`;

  return (
    <>
      <LiveRefresh types={["order.created", "order.updated", "session.opened", "session.closed"]} />
      <PageHeader title={t("title")} description={t("subtitle")} />
      <nav className="mb-5 flex gap-2" aria-label={t("title")}>
        {(
          [
            ["active", t("filterActive"), active.length],
            ["done", t("filterDone"), done.length],
          ] as const
        ).map(([key, label, n]) => (
          <Link
            key={key}
            href={key === "active" ? base : `${base}?view=done`}
            aria-current={view === key ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium",
              view === key ? "bg-fg text-bg" : "bg-surface-2 text-fg-muted",
            )}
          >
            {label} <span className="tabular-nums opacity-70">{n}</span>
          </Link>
        ))}
      </nav>
      {shown.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <h2 className="text-lg font-semibold">{t("empty")}</h2>
          <p className="mx-auto mt-1 max-w-sm text-fg-muted">{t("emptyBody")}</p>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((o) => (
            <li key={o.id}>
              <OrderCard
                restaurantId={ctx.restaurant.id}
                order={o}
                canUpdate={can(ctx, "orders.update_status")}
                canCancel={can(ctx, "orders.cancel")}
                timeZone={ctx.restaurant.timezone}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
