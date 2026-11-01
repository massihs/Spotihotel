import { Suspense } from "react";
import { KitchenBoard } from "@/components/dashboard/kitchen-board";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { listActiveOrders } from "@/server/modules/orders/service";

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
  const orders = (await listActiveOrders(db, ctx, { includeRecentMinutes: 30 })).filter(
    (o) => o.status !== "cancelled",
  );
  return (
    <KitchenBoard
      restaurantId={ctx.restaurant.id}
      orders={orders}
      timeZone={ctx.restaurant.timezone}
      canUpdate={can(ctx, "orders.update_status")}
      canCancel={can(ctx, "orders.cancel")}
    />
  );
}
