import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { orderItems, orders, tableSessions, users } from "@/server/db/schema";
import { assertCan, type RestaurantContext } from "@/server/tenancy";

export type TableRound = {
  id: string;
  number: string;
  status: string;
  placedAt: string;
  totalCents: number;
  paid: boolean;
  byMe: boolean;
  by: string | null;
  items: { name: string; quantity: number; note: string | null; options: string[] }[];
};

/** Every round ordered at the tables still seated, grouped by table: what the waiter sees before adding more. */
export async function openTableRounds(
  db: Database,
  ctx: RestaurantContext,
): Promise<Record<string, TableRound[]>> {
  assertCan(ctx, "orders.view");
  const rows = await db
    .select({
      id: orders.id,
      tableId: orders.tableId,
      number: orders.number,
      status: orders.status,
      placedAt: orders.placedAt,
      totalCents: orders.totalCents,
      paymentStatus: orders.paymentStatus,
      createdBy: orders.createdByUserId,
      byName: users.fullName,
    })
    .from(orders)
    .innerJoin(
      tableSessions,
      and(eq(tableSessions.id, orders.tableSessionId), eq(tableSessions.status, "open")),
    )
    .leftJoin(users, eq(users.id, orders.createdByUserId))
    .where(and(eq(orders.restaurantId, ctx.restaurant.id), ne(orders.status, "cancelled")))
    .orderBy(asc(orders.placedAt));
  if (rows.length === 0) return {};
  const items = await db
    .select({
      orderId: orderItems.orderId,
      name: orderItems.productName,
      quantity: orderItems.quantity,
      note: orderItems.note,
      options: orderItems.options,
    })
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        rows.map((r) => r.id),
      ),
    );
  const byOrder = new Map<string, TableRound["items"]>();
  for (const it of items) {
    const list = byOrder.get(it.orderId) ?? [];
    list.push({
      name: it.name,
      quantity: it.quantity,
      note: it.note,
      options: (it.options ?? []).map((o) => o.valueName),
    });
    byOrder.set(it.orderId, list);
  }
  const out: Record<string, TableRound[]> = {};
  for (const r of rows) {
    if (!r.tableId) continue;
    (out[r.tableId] ??= []).push({
      id: r.id,
      number: r.number,
      status: r.status,
      placedAt: r.placedAt.toISOString(),
      totalCents: r.totalCents,
      paid: r.paymentStatus === "paid",
      byMe: r.createdBy === ctx.user.id,
      by: r.byName,
      items: byOrder.get(r.id) ?? [],
    });
  }
  return out;
}
