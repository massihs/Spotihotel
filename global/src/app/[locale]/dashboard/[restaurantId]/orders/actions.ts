"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { updateOrderStatus } from "@/server/modules/orders/service";
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
