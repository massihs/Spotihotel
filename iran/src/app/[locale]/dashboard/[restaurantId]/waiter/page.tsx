import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { LiveIndicator, LiveRefresh } from "@/components/realtime/live";
import { WaiterApp } from "@/components/waiter/waiter-app";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getFloor } from "@/server/modules/floor/service";
import { getPublicMenu } from "@/server/modules/menu/public-cache";
import { openTableRounds } from "@/server/modules/waiter/service";
import { assertCan } from "@/server/tenancy";

type Params = PageProps<"/[locale]/dashboard/[restaurantId]/waiter">["params"];

export default function WaiterPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface-2" />}>
      <Waiter params={params} />
    </Suspense>
  );
}

async function Waiter({ params }: { params: Params }) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "orders.create");
  assertCan(ctx, "tables.view");
  const [t, menu, floor, rounds] = await Promise.all([
    getTranslations("waiter"),
    getPublicMenu(ctx.restaurant.id),
    getFloor(db, ctx),
    openTableRounds(db, ctx),
  ]);
  return (
    <>
      <LiveRefresh
        types={["order.created", "order.updated", "order.accepted", "session.opened", "session.closed"]}
      />
      <PageHeader title={t("title")} description={t("subtitle")} actions={<LiveIndicator />} />
      <WaiterApp
        restaurantId={ctx.restaurant.id}
        menu={menu}
        currency={ctx.restaurant.currency}
        tables={floor.map((f) => ({
          id: f.id,
          label: f.label,
          kind: f.kind,
          zone: f.zone,
          capacity: f.capacity,
          state: f.state,
          readyOrders: f.readyOrders,
          unpaidCents: f.unpaidCents,
          totalCents: f.totalCents,
        }))}
        rounds={rounds}
      />
    </>
  );
}
