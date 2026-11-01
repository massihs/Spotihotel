"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { acceptAllOrders, updateOrderStatus } from "@/server/modules/orders/service";
import type { OrderStatus } from "@/server/modules/orders/status";

const ALLOWED: OrderStatus[] = ["received", "accepted", "preparing", "ready", "served", "cancelled"];

export async function updateOrderStatusAction(
  restaurantId: string,
  orderId: string,
  to: OrderStatus,
  reason?: string,
) {
  return runAction(async () => {
    if (!ALLOWED.includes(to)) throw new Error("invalid status");
    const ctx = await actionContext(restaurantId);
    await updateOrderStatus(db, ctx, orderId, to, { reason });
    refresh();
  });
}

/** Kitchen / till: accept every new order at once (or start every accepted one). */
export async function acceptAllOrdersAction(
  restaurantId: string,
  orderIds: string[],
  from: "received" | "accepted" = "received",
) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    const res = await acceptAllOrders(db, ctx, {
      orderIds: orderIds.slice(0, 200),
      from: from === "accepted" ? "accepted" : "received",
    });
    refresh();
    return res;
  });
}
