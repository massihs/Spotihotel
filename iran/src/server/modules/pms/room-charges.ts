import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/server/db/client";
import { orders, paymentAllocations, payments, stays } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { emitPaymentUpdate, settleAllocations } from "@/server/modules/payments/service";
import { notFound } from "@/server/errors";
import type { RestaurantContext } from "@/server/tenancy";
import { randomToken } from "@/lib/ids";
import { mainFolioOf, postLine } from "./folios";
import { getPmsSettings } from "./setup";

/**
 * Room service and restaurant bills charged to a room: each unpaid order is settled by a
 * "room_charge" payment and appears on the stay's folio (department room_service, with the order's
 * own VAT). Paid at check-out with the rest of the bill. Idempotent: an order is charged once.
 */
async function chargeOrders(
  db: Database,
  restaurantId: string,
  timezone: string,
  currency: string,
  stay: typeof stays.$inferSelect,
  orderIds: string[] | null,
  actorUserId: string | null,
) {
  if (stay.status !== "in_house" || !stay.roomId) return 0;
  return db.transaction(async (tx) => {
    const due = await tx
      .select({
        id: orders.id,
        number: orders.number,
        totalCents: orders.totalCents,
        taxCents: orders.taxCents,
        tableSessionId: orders.tableSessionId,
      })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, restaurantId),
          eq(orders.tableId, stay.roomId!),
          gte(orders.createdAt, stay.checkedInAt ?? new Date(0)),
          sql`${orders.status} <> 'cancelled' and ${orders.paymentStatus} = 'unpaid'`,
          orderIds ? inArray(orders.id, orderIds) : undefined,
        ),
      )
      .for("update");
    const payable = due.filter((o) => o.totalCents > 0);
    if (!payable.length) return 0;
    const settings = await getPmsSettings(tx, restaurantId, timezone);
    const folio = await mainFolioOf(tx, restaurantId, stay.id);
    const total = payable.reduce((s, o) => s + o.totalCents, 0);
    const [payment] = await tx
      .insert(payments)
      .values({
        restaurantId,
        tableSessionId: payable[0]!.tableSessionId,
        provider: "room_charge",
        status: "succeeded",
        succeededAt: new Date(),
        amountCents: total,
        currency,
        idempotencyKey: `room-${randomToken(20)}`,
        recordedByUserId: actorUserId,
        metadata: { stayId: stay.id, folioId: folio.id },
      })
      .returning();
    await tx.insert(paymentAllocations).values(
      payable.map((o) => ({
        restaurantId,
        paymentId: payment!.id,
        orderId: o.id,
        amountCents: o.totalCents,
      })),
    );
    for (const o of payable) {
      const base = o.totalCents - o.taxCents;
      await postLine(tx, restaurantId, timezone, {
        folioId: folio.id,
        kind: "charge",
        department: "room_service",
        description: `order:${o.number}`,
        unitCents: o.totalCents,
        amountCents: o.totalCents,
        taxRateBps: base > 0 ? Math.round((o.taxCents * 10_000) / base) : 0,
        taxCents: o.taxCents,
        sourceType: "order",
        sourceId: o.id,
        userId: actorUserId,
        businessDate: settings.businessDate,
      });
    }
    await settleAllocations(tx, payment!, actorUserId);
    await emitPaymentUpdate(tx, payment!);
    await recordAudit(tx, {
      action: "folio.orders_charged",
      actorUserId,
      restaurantId,
      entityType: "stay",
      entityId: stay.id,
      metadata: { orders: payable.map((o) => o.number), amountCents: total },
    });
    return total;
  });
}

/** Staff side (and check-out): everything the room ordered and did not pay goes on its bill. */
export async function chargeRoomOrders(db: Database, ctx: RestaurantContext, stayId: string) {
  const [stay] = await db
    .select()
    .from(stays)
    .where(and(eq(stays.id, stayId), eq(stays.restaurantId, ctx.restaurant.id)));
  if (!stay) throw notFound();
  return chargeOrders(
    db,
    ctx.restaurant.id,
    ctx.restaurant.timezone,
    ctx.restaurant.currency,
    stay,
    null,
    ctx.user.id,
  );
}

/**
 * Guest side: an order placed from an occupied room's QR is charged to the room at once when the
 * hotel enabled it (returns the amount charged, 0 when the room has no guest checked in).
 */
export async function autoChargeOrder(
  db: Database,
  restaurant: { id: string; timezone: string; currency: string },
  roomId: string,
  orderId: string,
) {
  const settings = await getPmsSettings(db, restaurant.id, restaurant.timezone);
  if (!settings.autoChargeRoomService) return 0;
  const stay = await inHouseStay(db, restaurant.id, roomId);
  if (!stay) return 0;
  return chargeOrders(db, restaurant.id, restaurant.timezone, restaurant.currency, stay, [orderId], null);
}

async function inHouseStay(db: DbOrTx, restaurantId: string, roomId: string) {
  const [s] = await db
    .select()
    .from(stays)
    .where(and(eq(stays.restaurantId, restaurantId), eq(stays.roomId, roomId), eq(stays.status, "in_house")))
    .limit(1);
  return s ?? null;
}
