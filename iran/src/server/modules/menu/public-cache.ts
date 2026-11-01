import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { and, desc, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { orderItems, orders } from "@/server/db/schema";
import { menuTag } from "./cache";
import { loadPublicMenu } from "./public";

/**
 * Cached public menu. Expired by `updateTag(menuTag(id))` on every menu change in the dashboard,
 * so guests get a fast (no DB hit) and up-to-date menu.
 */
export async function getPublicMenu(restaurantId: string) {
  "use cache";
  cacheTag(menuTag(restaurantId));
  cacheLife("hours");
  return loadPublicMenu(db, restaurantId);
}

/** Best sellers of the last 30 days (at least 3 sold), refreshed hourly: the "popular" badge. */
export async function getPopularProductIds(restaurantId: string): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await db
    .select({ id: orderItems.productId, n: sql<number>`sum(${orderItems.quantity})::int` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.restaurantId, restaurantId),
        gte(orders.createdAt, since),
        ne(orders.status, "cancelled"),
        isNotNull(orderItems.productId),
      ),
    )
    .groupBy(orderItems.productId)
    .having(sql`sum(${orderItems.quantity}) >= 3`)
    .orderBy(desc(sql`sum(${orderItems.quantity})`))
    .limit(6);
  return rows.map((r) => r.id!);
}
