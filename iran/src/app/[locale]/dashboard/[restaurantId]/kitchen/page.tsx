import { Suspense } from "react";
import { KitchenBoard } from "@/components/dashboard/kitchen-board";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { listActiveOrders } from "@/server/modules/orders/service";
import { listStations } from "@/server/modules/kitchen/stations";
import { cashierAcceptanceOf } from "@/server/modules/printing/service";

type Params = PageProps<"/[locale]/dashboard/[restaurantId]/kitchen">["params"];

export default function KitchenPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface-2" />}>
      <Kitchen params={params} />
    </Suspense>
  );
}

async function Kitchen({ params }: { params: Params }) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "orders.view");
  // Active orders + those served/cancelled in the last 30 minutes.
  const [active, setup, acceptAtTill] = await Promise.all([
    listActiveOrders(db, ctx, { includeRecentMinutes: 30 }),
    listStations(db, ctx),
    cashierAcceptanceOf(db, ctx.restaurant.id),
  ]);
  const orders = active.filter((o) => o.status !== "cancelled");
  return (
    <KitchenBoard
      restaurantId={ctx.restaurant.id}
      orders={orders}
      timeZone={ctx.restaurant.timezone}
      canUpdate={can(ctx, "orders.update_status")}
      canCancel={can(ctx, "orders.cancel")}
      stations={setup.stations.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
      categories={setup.categories}
      canManage={can(ctx, "menu.manage")}
      acceptAtTill={acceptAtTill}
      defaultStation={ctx.stationId ?? null}
    />
  );
}
