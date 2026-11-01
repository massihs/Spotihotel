import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  diningTables,
  guestBlocks,
  orders,
  restaurantSettings,
  sessionParticipants,
  tableSessions,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict, notFound } from "@/server/errors";
import { emit, topics } from "@/server/infra/realtime";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { updateOrderStatus } from "@/server/modules/orders/service";

/**
 * Anti-abuse for guests (somebody who scanned a QR once and plays with the link later):
 * - the staff can block a device: it can no longer enter or act in the restaurant;
 * - few orders may wait for the staff at once (per guest and per table);
 * - optionally, a table opened by a scan may only order or call once a waiter confirmed it.
 */

/** A waiter lets a table opened by a scan order (or the staff seats it themselves). */
export async function confirmTableSession(db: Database, ctx: RestaurantContext, tableId: string) {
  assertCan(ctx, "orders.update_status");
  if (!isUuid(tableId)) throw notFound();
  return db.transaction(async (tx) => {
    const [session] = await tx
      .update(tableSessions)
      .set({ confirmedAt: new Date() })
      .where(
        and(
          eq(tableSessions.restaurantId, ctx.restaurant.id),
          eq(tableSessions.tableId, tableId),
          eq(tableSessions.status, "open"),
          isNull(tableSessions.confirmedAt),
        ),
      )
      .returning({ id: tableSessions.id });
    if (!session) return null;
    await emit(tx, {
      topic: topics.session(session.id),
      type: "session.opened",
      data: { tableId, confirmed: true },
    });
    await emit(tx, {
      topic: topics.restaurant(ctx.restaurant.id),
      type: "session.opened",
      data: { tableId },
    });
    await recordAudit(tx, {
      action: "table_session.confirmed",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "table_session",
      entityId: session.id,
    });
    return session;
  });
}

/**
 * Blocks the device behind an order (or a seat): it is kept out of the restaurant, and its
 * orders still waiting for the staff are cancelled.
 */
export async function blockGuest(
  db: Database,
  ctx: RestaurantContext,
  target: { orderId?: string; participantId?: string },
  reason = "",
) {
  assertCan(ctx, "orders.cancel");
  const rid = ctx.restaurant.id;
  const id = target.orderId ?? target.participantId ?? "";
  if (!isUuid(id)) throw notFound();
  const [who] = target.orderId
    ? await db
        .select({
          guestId: sessionParticipants.guestId,
          tableLabel: orders.tableLabel,
          orderNumber: orders.number,
        })
        .from(orders)
        .innerJoin(sessionParticipants, eq(sessionParticipants.id, orders.participantId))
        .where(and(eq(orders.id, id), eq(orders.restaurantId, rid)))
    : await db
        .select({
          guestId: sessionParticipants.guestId,
          tableLabel: diningTables.label,
          orderNumber: sql<string | null>`null`,
        })
        .from(sessionParticipants)
        .innerJoin(tableSessions, eq(tableSessions.id, sessionParticipants.tableSessionId))
        .innerJoin(diningTables, eq(diningTables.id, tableSessions.tableId))
        .where(and(eq(sessionParticipants.id, id), eq(sessionParticipants.restaurantId, rid)));
  // Orders rung up by the staff have no guest behind them.
  if (!who) throw conflict("not_a_guest_order");

  await db
    .insert(guestBlocks)
    .values({
      restaurantId: rid,
      guestId: who.guestId,
      tableLabel: who.tableLabel?.slice(0, 50) ?? null,
      orderNumber: who.orderNumber,
      reason: reason.trim().slice(0, 200) || null,
      blockedByUserId: ctx.user.id,
    })
    .onConflictDoNothing();

  const waiting = await db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(sessionParticipants, eq(sessionParticipants.id, orders.participantId))
    .where(
      and(
        eq(orders.restaurantId, rid),
        eq(sessionParticipants.guestId, who.guestId),
        inArray(orders.status, ["received", "pending_payment"]),
      ),
    );
  for (const o of waiting) await updateOrderStatus(db, ctx, o.id, "cancelled", { reason: "blocked" });

  await recordAudit(db, {
    action: "guest.blocked",
    actorUserId: ctx.user.id,
    restaurantId: rid,
    entityType: "guest",
    entityId: who.guestId,
    metadata: { table: who.tableLabel, order: who.orderNumber, cancelled: waiting.length },
  });
  return { cancelled: waiting.length };
}

export async function listGuestBlocks(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  return db
    .select({
      id: guestBlocks.id,
      tableLabel: guestBlocks.tableLabel,
      orderNumber: guestBlocks.orderNumber,
      reason: guestBlocks.reason,
      createdAt: guestBlocks.createdAt,
    })
    .from(guestBlocks)
    .where(eq(guestBlocks.restaurantId, ctx.restaurant.id))
    .orderBy(desc(guestBlocks.createdAt))
    .limit(200);
}

export async function unblockGuest(db: Database, ctx: RestaurantContext, blockId: string) {
  assertCan(ctx, "orders.cancel");
  if (!isUuid(blockId)) throw notFound();
  const [gone] = await db
    .delete(guestBlocks)
    .where(and(eq(guestBlocks.id, blockId), eq(guestBlocks.restaurantId, ctx.restaurant.id)))
    .returning({ guestId: guestBlocks.guestId });
  if (!gone) throw notFound();
  await recordAudit(db, {
    action: "guest.unblocked",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "guest",
    entityId: gone.guestId,
  });
}

export async function setScansNeedStaff(db: Database, ctx: RestaurantContext, on: boolean) {
  assertCan(ctx, "restaurant.manage");
  await db
    .update(restaurantSettings)
    .set({ guestOrdersNeedStaff: on })
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  await recordAudit(db, {
    action: "restaurant.settings_updated",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    metadata: { guestOrdersNeedStaff: on },
  });
}
