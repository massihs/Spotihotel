import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import { assertCan, type RestaurantContext } from "@/server/tenancy";

/** Restaurant-wide notifications (userId null) plus those addressed to the current user. */
const visibleTo = (ctx: RestaurantContext) =>
  and(
    eq(notifications.restaurantId, ctx.restaurant.id),
    or(isNull(notifications.userId), eq(notifications.userId, ctx.user.id)),
  );

export async function listNotifications(db: Database, ctx: RestaurantContext, limit = 20) {
  assertCan(ctx, "restaurant.view");
  const [items, [unread]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(visibleTo(ctx))
      .orderBy(desc(notifications.createdAt))
      .limit(Math.min(limit, 100)),
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(notifications)
      .where(and(visibleTo(ctx), isNull(notifications.readAt))),
  ]);
  return { items, unread: unread?.n ?? 0 };
}

/** Marks the visible notifications as seen (shared acknowledgement for the restaurant team). */
export async function markNotificationsRead(db: Database, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(visibleTo(ctx), isNull(notifications.readAt)));
}
