import { scheduleFeedback } from "@/server/modules/feedback/service";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  couriers,
  customerAddresses,
  customers,
  deliveryZones,
  orderStatusEvents,
  orders,
  paymentAllocations,
  payments,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { issueInvoiceInTx } from "@/server/modules/invoices/service";
import { emit, topics } from "@/server/infra/realtime";
import { conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid, randomToken } from "@/lib/ids";
import { MAX_AMOUNT_CENTS } from "@/lib/money";
import { emitPaymentUpdate, settleAllocations } from "@/server/modules/payments/service";

const cents = z.coerce.number().int().min(0).max(MAX_AMOUNT_CENTS);
const liveZone = (rid: string) => and(eq(deliveryZones.restaurantId, rid), isNull(deliveryZones.deletedAt));
const liveCourier = (rid: string) => and(eq(couriers.restaurantId, rid), isNull(couriers.deletedAt));

// ─── Zones ───────────────────────────────────────────────────────────────────

export const zoneSchema = z.object({
  name: z.string().trim().min(1).max(80),
  feeCents: cents.default(0),
  minOrderCents: cents.default(0),
  etaMinutes: z.coerce.number().int().min(5).max(240).default(45),
  isActive: z.boolean().default(true),
});

export async function listZones(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "orders.view");
  return db
    .select()
    .from(deliveryZones)
    .where(liveZone(ctx.restaurant.id))
    .orderBy(asc(deliveryZones.sortOrder), asc(deliveryZones.createdAt));
}

export async function saveZone(
  db: Database,
  ctx: RestaurantContext,
  id: string | null,
  raw: z.input<typeof zoneSchema>,
) {
  assertCan(ctx, "restaurant.manage");
  const input = zoneSchema.parse(raw);
  if (id) {
    if (!isUuid(id)) throw notFound();
    const res = await db
      .update(deliveryZones)
      .set(input)
      .where(and(eq(deliveryZones.id, id), liveZone(ctx.restaurant.id)))
      .returning();
    if (!res.length) throw notFound();
    return res[0]!;
  }
  const [z0] = await db
    .insert(deliveryZones)
    .values({ restaurantId: ctx.restaurant.id, ...input })
    .returning();
  return z0!;
}

export async function deleteZone(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "restaurant.manage");
  if (!isUuid(id)) throw notFound();
  await db
    .update(deliveryZones)
    .set({ deletedAt: new Date() })
    .where(and(eq(deliveryZones.id, id), liveZone(ctx.restaurant.id)));
}

/** The zone a delivery order uses (active, of this restaurant), or not found. */
export async function getZone(db: DbOrTx, rid: string, id: string) {
  if (!isUuid(id)) throw notFound();
  const [z0] = await db
    .select()
    .from(deliveryZones)
    .where(and(eq(deliveryZones.id, id), liveZone(rid), eq(deliveryZones.isActive, true)));
  if (!z0) throw notFound();
  return z0;
}

// ─── Couriers ────────────────────────────────────────────────────────────────

export const courierSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .max(20)
    .transform((v) => v || null)
    .nullable()
    .optional(),
});

export async function listCouriers(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "orders.view");
  return db.select().from(couriers).where(liveCourier(ctx.restaurant.id)).orderBy(asc(couriers.name));
}

export async function createCourier(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof courierSchema>,
) {
  assertCan(ctx, "restaurant.manage");
  const input = courierSchema.parse(raw);
  const [c] = await db
    .insert(couriers)
    .values({ restaurantId: ctx.restaurant.id, name: input.name, phone: input.phone ?? null })
    .returning();
  return c!;
}

export async function setCourierActive(db: Database, ctx: RestaurantContext, id: string, isActive: boolean) {
  assertCan(ctx, "restaurant.manage");
  if (!isUuid(id)) throw notFound();
  await db
    .update(couriers)
    .set({ isActive })
    .where(and(eq(couriers.id, id), liveCourier(ctx.restaurant.id)));
}

export async function deleteCourier(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "restaurant.manage");
  if (!isUuid(id)) throw notFound();
  await db
    .update(couriers)
    .set({ deletedAt: new Date() })
    .where(and(eq(couriers.id, id), liveCourier(ctx.restaurant.id)));
}

// ─── Customer addresses ──────────────────────────────────────────────────────

export async function listAddresses(db: DbOrTx, rid: string, customerId: string) {
  return db
    .select({
      id: customerAddresses.id,
      label: customerAddresses.label,
      address: customerAddresses.address,
      zoneId: customerAddresses.zoneId,
    })
    .from(customerAddresses)
    .where(
      and(
        eq(customerAddresses.restaurantId, rid),
        eq(customerAddresses.customerId, customerId),
        isNull(customerAddresses.deletedAt),
      ),
    )
    .orderBy(desc(customerAddresses.updatedAt));
}

/** Stores an address on the customer file unless the same text is already there. */
export async function rememberAddress(
  tx: DbOrTx,
  rid: string,
  customerId: string,
  address: string,
  zoneId: string | null,
) {
  const text = address.trim();
  const existing = (await listAddresses(tx, rid, customerId)).find((a) => a.address.trim() === text);
  if (existing) {
    await tx
      .update(customerAddresses)
      .set({ zoneId, updatedAt: new Date() })
      .where(eq(customerAddresses.id, existing.id));
    return existing.id;
  }
  const [a] = await tx
    .insert(customerAddresses)
    .values({ restaurantId: rid, customerId, address: text, zoneId })
    .returning({ id: customerAddresses.id });
  return a!.id;
}

export async function deleteAddress(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "customers.manage");
  if (!isUuid(id)) throw notFound();
  await db
    .update(customerAddresses)
    .set({ deletedAt: new Date() })
    .where(and(eq(customerAddresses.id, id), eq(customerAddresses.restaurantId, ctx.restaurant.id)));
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

const DAY = 86_400_000;

/**
 * Dispatch board: delivery orders still in the restaurant (to assign), on the road, and
 * delivered but not yet settled with the courier (plus today's settled ones).
 */
export async function listDeliveries(db: DbOrTx, ctx: RestaurantContext, now = new Date()) {
  assertCan(ctx, "orders.view");
  const rid = ctx.restaurant.id;
  const rows = await db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      totalCents: orders.totalCents,
      deliveryFeeCents: orders.deliveryFeeCents,
      address: orders.deliveryAddress,
      phone: orders.customerPhone,
      note: orders.note,
      placedAt: orders.placedAt,
      readyAt: orders.readyAt,
      dispatchedAt: orders.dispatchedAt,
      deliveredAt: orders.deliveredAt,
      courierSettledAt: orders.courierSettledAt,
      courierId: orders.courierId,
      courierName: couriers.name,
      zoneName: deliveryZones.name,
      customerName: customers.name,
    })
    .from(orders)
    .leftJoin(couriers, eq(couriers.id, orders.courierId))
    .leftJoin(deliveryZones, eq(deliveryZones.id, orders.deliveryZoneId))
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(
      and(
        eq(orders.restaurantId, rid),
        eq(orders.channel, "delivery"),
        ne(orders.status, "cancelled"),
        or(isNull(orders.courierSettledAt), gte(orders.courierSettledAt, new Date(now.getTime() - DAY))),
      ),
    )
    .orderBy(asc(orders.placedAt))
    .limit(300);
  return {
    toAssign: rows.filter((r) => !r.dispatchedAt),
    onTheRoad: rows.filter((r) => r.dispatchedAt && !r.deliveredAt),
    delivered: rows.filter((r) => r.deliveredAt),
  };
}
export type DeliveryRow = Awaited<ReturnType<typeof listDeliveries>>["toAssign"][number];

async function loadDelivery(tx: DbOrTx, rid: string, orderId: string) {
  if (!isUuid(orderId)) throw notFound();
  const [o] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, rid), eq(orders.channel, "delivery")))
    .for("update");
  if (!o) throw notFound();
  if (o.status === "cancelled") throw conflict("order_cancelled");
  return o;
}

async function emitUpdated(tx: DbOrTx, rid: string, orderId: string) {
  await emit(tx, { topic: topics.restaurant(rid), type: "order.updated", data: { orderId, tableId: null } });
}

/** Hands the order to a courier: it leaves the restaurant now. */
export async function dispatchOrder(
  db: Database,
  ctx: RestaurantContext,
  orderId: string,
  courierId: string,
) {
  assertCan(ctx, "orders.update_status");
  const rid = ctx.restaurant.id;
  if (!isUuid(courierId)) throw notFound();
  await db.transaction(async (tx) => {
    const o = await loadDelivery(tx, rid, orderId);
    if (o.deliveredAt) throw conflict("already_delivered");
    const [c] = await tx
      .select({ id: couriers.id })
      .from(couriers)
      .where(and(eq(couriers.id, courierId), liveCourier(rid), eq(couriers.isActive, true)));
    if (!c) throw notFound();
    const now = new Date();
    await tx
      .update(orders)
      .set({
        courierId,
        dispatchedAt: o.dispatchedAt ?? now,
        readyAt: o.readyAt ?? now,
        ...(["received", "accepted", "preparing"].includes(o.status) ? { status: "ready" as const } : {}),
      })
      .where(eq(orders.id, o.id));
    if (["received", "accepted", "preparing"].includes(o.status))
      await tx.insert(orderStatusEvents).values({
        restaurantId: rid,
        orderId: o.id,
        fromStatus: o.status,
        toStatus: "ready",
        actorUserId: ctx.user.id,
      });
    await recordAudit(tx, {
      action: "delivery.dispatched",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "order",
      entityId: o.id,
      metadata: { number: o.number, courierId },
    });
    await emitUpdated(tx, rid, o.id);
  });
}

/** The courier is back: the order is delivered (served). */
export async function markDelivered(db: Database, ctx: RestaurantContext, orderId: string) {
  assertCan(ctx, "orders.update_status");
  const rid = ctx.restaurant.id;
  await db.transaction(async (tx) => {
    const o = await loadDelivery(tx, rid, orderId);
    if (!o.dispatchedAt) throw conflict("not_dispatched");
    if (o.deliveredAt) return;
    const now = new Date();
    await tx
      .update(orders)
      .set({ deliveredAt: now, servedAt: now, status: "served" })
      .where(eq(orders.id, o.id));
    if (o.status !== "served")
      await tx.insert(orderStatusEvents).values({
        restaurantId: rid,
        orderId: o.id,
        fromStatus: o.status,
        toStatus: "served",
        actorUserId: ctx.user.id,
      });
    const [phone] = await tx.select({ p: orders.customerPhone }).from(orders).where(eq(orders.id, o.id));
    await scheduleFeedback(tx, { id: o.id, restaurantId: rid, customerPhone: phone?.p ?? null });
    await emitUpdated(tx, rid, o.id);
  });
}

/** What each courier has to hand in: delivered, unsettled orders, unpaid ones are collected cash. */
export async function courierBalances(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "orders.view");
  const rid = ctx.restaurant.id;
  return db
    .select({
      courierId: couriers.id,
      name: couriers.name,
      phone: couriers.phone,
      isActive: couriers.isActive,
      deliveries: sql<number>`count(${orders.id})`.mapWith(Number),
      collectCents:
        sql<number>`coalesce(sum(case when ${orders.paymentStatus} <> 'paid' then ${orders.totalCents} else 0 end), 0)`.mapWith(
          Number,
        ),
      onTheRoad:
        sql<number>`(select count(*) from orders o2 where o2.courier_id = ${couriers.id} and o2.dispatched_at is not null and o2.delivered_at is null and o2.status <> 'cancelled')`.mapWith(
          Number,
        ),
    })
    .from(couriers)
    .leftJoin(
      orders,
      and(
        eq(orders.courierId, couriers.id),
        isNotNull(orders.deliveredAt),
        isNull(orders.courierSettledAt),
        ne(orders.status, "cancelled"),
      ),
    )
    .where(liveCourier(rid))
    .groupBy(couriers.id)
    .orderBy(asc(couriers.name));
}

/**
 * Settles a courier (تسویه با پیک): the cash they collected for unpaid delivered orders is
 * recorded as one cash payment, and every delivered order of theirs is marked settled.
 */
export async function settleCourier(db: Database, ctx: RestaurantContext, courierId: string) {
  assertCan(ctx, "payments.record");
  const rid = ctx.restaurant.id;
  if (!isUuid(courierId)) throw notFound();
  return db.transaction(async (tx) => {
    const due = await tx
      .select({
        id: orders.id,
        number: orders.number,
        totalCents: orders.totalCents,
        paymentStatus: orders.paymentStatus,
      })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, rid),
          eq(orders.courierId, courierId),
          isNotNull(orders.deliveredAt),
          isNull(orders.courierSettledAt),
          ne(orders.status, "cancelled"),
        ),
      )
      .for("update");
    if (!due.length) throw conflict("nothing_to_settle");
    const unpaid = due.filter((o) => o.paymentStatus !== "paid");
    const amountCents = unpaid.reduce((s, o) => s + o.totalCents, 0);
    if (amountCents > 0) {
      const [p] = await tx
        .insert(payments)
        .values({
          restaurantId: rid,
          provider: "cash",
          status: "succeeded",
          succeededAt: new Date(),
          amountCents,
          currency: ctx.restaurant.currency,
          idempotencyKey: `courier_${randomToken(20)}`,
          recordedByUserId: ctx.user.id,
          metadata: { courierId, delivery: true },
        })
        .returning();
      await tx.insert(paymentAllocations).values(
        unpaid.map((o) => ({
          restaurantId: rid,
          paymentId: p!.id,
          orderId: o.id,
          amountCents: o.totalCents,
        })),
      );
      await settleAllocations(tx, p!, ctx.user.id);
      await issueInvoiceInTx(tx, rid, p!.id, ctx.user.id);
      await emitPaymentUpdate(tx, p!);
    }
    await tx
      .update(orders)
      .set({ courierSettledAt: new Date() })
      .where(
        inArray(
          orders.id,
          due.map((o) => o.id),
        ),
      );
    await recordAudit(tx, {
      action: "delivery.courier_settled",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "courier",
      entityId: courierId,
      metadata: { orders: due.map((o) => o.number), amountCents },
    });
    return { orders: due.length, amountCents };
  });
}

/** Courier performance over a period: deliveries and average round trip (dispatch → back). */
export async function courierStats(db: DbOrTx, ctx: RestaurantContext, days: number, now = new Date()) {
  assertCan(ctx, "orders.view");
  const from = new Date(now.getTime() - days * DAY);
  return db
    .select({
      courierId: orders.courierId,
      name: couriers.name,
      deliveries: sql<number>`count(*)`.mapWith(Number),
      avgMinutes:
        sql<number>`coalesce(round(avg(extract(epoch from (${orders.deliveredAt} - ${orders.dispatchedAt})) / 60)), 0)`.mapWith(
          Number,
        ),
      totalCents: sql<number>`coalesce(sum(${orders.totalCents}), 0)`.mapWith(Number),
    })
    .from(orders)
    .innerJoin(couriers, eq(couriers.id, orders.courierId))
    .where(
      and(
        eq(orders.restaurantId, ctx.restaurant.id),
        isNotNull(orders.deliveredAt),
        gte(orders.deliveredAt, from),
        ne(orders.status, "cancelled"),
      ),
    )
    .groupBy(orders.courierId, couriers.name)
    .orderBy(desc(sql`3`));
}

/** Delivery orders waiting for a courier (sidebar badge). */
export async function countToDispatch(db: DbOrTx, ctx: RestaurantContext) {
  if (!ctx.permissions.has("orders.view")) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(orders)
    .where(
      and(
        eq(orders.restaurantId, ctx.restaurant.id),
        eq(orders.channel, "delivery"),
        isNull(orders.dispatchedAt),
        ne(orders.status, "cancelled"),
      ),
    );
  return row?.n ?? 0;
}
