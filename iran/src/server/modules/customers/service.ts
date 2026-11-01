import { and, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  cashMovements,
  cashShifts,
  coupons,
  customerAccountEntries,
  customers,
  loyaltyEntries,
  orders,
  restaurantSettings,
  smsCampaigns,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { sms } from "@/server/infra/sms";
import { conflict, notFound, validation } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { MAX_AMOUNT_CENTS } from "@/lib/money";
import { asciiDigits, normalizeIranMobile } from "@/lib/phone";
import { couponDiscount } from "@/lib/coupon";
import { listAddresses } from "@/server/modules/delivery/service";

const cents = z.coerce.number().int().min(0).max(MAX_AMOUNT_CENTS);
const DAY = 86_400_000;

// ─── Loyalty settings ────────────────────────────────────────────────────────

export async function loyaltyConfig(db: DbOrTx, rid: string) {
  const [s] = await db
    .select({
      enabled: restaurantSettings.loyaltyEnabled,
      spendPerPointCents: restaurantSettings.loyaltySpendPerPointCents,
      pointValueCents: restaurantSettings.loyaltyPointValueCents,
    })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, rid));
  return s ?? { enabled: true, spendPerPointCents: 10_000_000, pointValueCents: 500_000 };
}

export const loyaltySettingsSchema = z.object({
  enabled: z.boolean(),
  spendPerPointCents: cents.min(1),
  pointValueCents: cents,
});

export async function updateLoyaltySettings(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof loyaltySettingsSchema>,
) {
  assertCan(ctx, "customers.manage");
  const input = loyaltySettingsSchema.parse(raw);
  await db
    .update(restaurantSettings)
    .set({
      loyaltyEnabled: input.enabled,
      loyaltySpendPerPointCents: input.spendPerPointCents,
      loyaltyPointValueCents: input.pointValueCents,
    })
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  await recordAudit(db, {
    action: "loyalty.settings_updated",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "restaurant",
    entityId: ctx.restaurant.id,
    metadata: input,
  });
}

// ─── Orders → customer file ──────────────────────────────────────────────────

/** Creates or finds the customer of a phone number and links the order to it. */
export async function linkOrderCustomer(
  tx: DbOrTx,
  rid: string,
  orderId: string,
  phone: string,
  name?: string | null,
) {
  const now = new Date();
  const [c] = await tx
    .insert(customers)
    .values({ restaurantId: rid, phone, name: name || null, ordersCount: 1, lastOrderAt: now })
    .onConflictDoUpdate({
      target: [customers.restaurantId, customers.phone],
      set: {
        ordersCount: sql`${customers.ordersCount} + 1`,
        lastOrderAt: now,
        ...(name ? { name } : {}),
      },
    })
    .returning();
  await tx.update(orders).set({ customerId: c!.id }).where(eq(orders.id, orderId));
  return c!;
}

/** An active, unexpired coupon with uses left, or null. */
export async function findUsableCoupon(db: DbOrTx, rid: string, raw: string) {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return null;
  const [c] = await db
    .select()
    .from(coupons)
    .where(and(eq(coupons.restaurantId, rid), eq(coupons.code, code), eq(coupons.isActive, true)));
  if (!c || (c.endsAt && c.endsAt <= new Date()) || (c.maxUses != null && c.usedCount >= c.maxUses))
    return null;
  return c;
}

export type DiscountRequest = {
  totalCents: number;
  couponCode?: string | null;
  redeemPoints?: number;
  customer?: { id: string; points: number } | null;
};

/** Coupon and loyalty discounts for a bill. Read only: `commitDiscounts` books them. */
export async function computeDiscounts(tx: DbOrTx, rid: string, req: DiscountRequest) {
  let couponId: string | null = null;
  let couponCents = 0;
  if (req.couponCode?.trim()) {
    const c = await findUsableCoupon(tx, rid, req.couponCode);
    if (!c) throw validation("coupon_invalid", { field: "coupon" });
    if (req.totalCents < c.minOrderCents)
      throw validation("coupon_min_order", { field: "coupon", amountCents: c.minOrderCents });
    couponCents = couponDiscount(c, req.totalCents);
    couponId = c.id;
  }

  let pointsRedeemed = 0;
  let pointsCents = 0;
  if (req.redeemPoints && req.redeemPoints > 0) {
    if (!req.customer) throw validation("customer_required", { field: "phone" });
    const cfg = await loyaltyConfig(tx, rid);
    if (!cfg.enabled || cfg.pointValueCents <= 0) throw validation("loyalty_disabled");
    const left = req.totalCents - couponCents;
    pointsRedeemed = Math.max(
      0,
      Math.min(Math.floor(req.redeemPoints), req.customer.points, Math.floor(left / cfg.pointValueCents)),
    );
    pointsCents = pointsRedeemed * cfg.pointValueCents;
  }
  return { couponId, couponCents, pointsRedeemed, pointsCents, discountCents: couponCents + pointsCents };
}

/** Books a coupon use and spent points for a new order (guarded against races). */
export async function commitDiscounts(
  tx: DbOrTx,
  rid: string,
  orderId: string,
  d: { couponId: string | null; pointsRedeemed: number; customerId: string | null },
  actorUserId: string | null,
) {
  if (d.couponId) {
    const used = await tx
      .update(coupons)
      .set({ usedCount: sql`${coupons.usedCount} + 1` })
      .where(
        and(eq(coupons.id, d.couponId), or(isNull(coupons.maxUses), lt(coupons.usedCount, coupons.maxUses))),
      )
      .returning({ id: coupons.id });
    if (used.length === 0) throw validation("coupon_invalid", { field: "coupon" });
    await tx.update(orders).set({ couponId: d.couponId }).where(eq(orders.id, orderId));
  }
  if (d.pointsRedeemed > 0 && d.customerId) {
    const spent = await tx
      .update(customers)
      .set({ points: sql`${customers.points} - ${d.pointsRedeemed}` })
      .where(and(eq(customers.id, d.customerId), gte(customers.points, d.pointsRedeemed)))
      .returning({ id: customers.id });
    if (spent.length === 0) throw conflict("points_insufficient");
    await tx.insert(loyaltyEntries).values({
      restaurantId: rid,
      customerId: d.customerId,
      orderId,
      kind: "redeem",
      points: -d.pointsRedeemed,
      actorUserId,
    });
    await tx.update(orders).set({ pointsRedeemed: d.pointsRedeemed }).where(eq(orders.id, orderId));
  }
}

/** Paid orders earn points and count in the customer's spend. Idempotent per order. */
export async function onOrdersPaid(tx: DbOrTx, rid: string, orderIds: string[]) {
  if (orderIds.length === 0) return;
  const rows = await tx
    .select({ id: orders.id, customerId: orders.customerId, totalCents: orders.totalCents })
    .from(orders)
    .where(and(inArray(orders.id, orderIds), eq(orders.restaurantId, rid)));
  const linked = rows.filter((r) => r.customerId);
  if (linked.length === 0) return;
  const cfg = await loyaltyConfig(tx, rid);
  for (const o of linked) {
    const points = cfg.enabled ? Math.floor(o.totalCents / Math.max(1, cfg.spendPerPointCents)) : 0;
    const [entry] = await tx
      .insert(loyaltyEntries)
      .values({ restaurantId: rid, customerId: o.customerId!, orderId: o.id, kind: "earn", points })
      .onConflictDoNothing()
      .returning({ id: loyaltyEntries.id });
    if (!entry) continue;
    await tx
      .update(customers)
      .set({
        points: sql`${customers.points} + ${points}`,
        totalSpentCents: sql`${customers.totalSpentCents} + ${o.totalCents}`,
      })
      .where(eq(customers.id, o.customerId!));
  }
}

/** A cancelled order gives back its points and its coupon use, and loses what it earned. */
export async function onOrderCancelled(tx: DbOrTx, rid: string, orderId: string) {
  const [o] = await tx
    .select({
      customerId: orders.customerId,
      couponId: orders.couponId,
      totalCents: orders.totalCents,
    })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, rid)));
  if (!o) return;
  if (o.couponId)
    await tx
      .update(coupons)
      .set({ usedCount: sql`greatest(${coupons.usedCount} - 1, 0)` })
      .where(eq(coupons.id, o.couponId));
  if (!o.customerId) return;
  const entries = await tx.select().from(loyaltyEntries).where(eq(loyaltyEntries.orderId, orderId));
  const has = (k: string) => entries.some((e) => e.kind === k);
  const earn = entries.find((e) => e.kind === "earn");
  if (earn && !has("reverse_earn")) {
    await tx.insert(loyaltyEntries).values({
      restaurantId: rid,
      customerId: o.customerId,
      orderId,
      kind: "reverse_earn",
      points: -earn.points,
    });
    await tx
      .update(customers)
      .set({
        points: sql`greatest(${customers.points} - ${earn.points}, 0)`,
        totalSpentCents: sql`greatest(${customers.totalSpentCents} - ${o.totalCents}, 0)`,
      })
      .where(eq(customers.id, o.customerId));
  }
  const redeem = entries.find((e) => e.kind === "redeem");
  if (redeem && !has("reverse_redeem")) {
    await tx.insert(loyaltyEntries).values({
      restaurantId: rid,
      customerId: o.customerId,
      orderId,
      kind: "reverse_redeem",
      points: -redeem.points,
    });
    await tx
      .update(customers)
      .set({ points: sql`${customers.points} + ${-redeem.points}` })
      .where(eq(customers.id, o.customerId));
  }
}

// ─── Customer file ───────────────────────────────────────────────────────────

export const AUDIENCES = ["all", "inactive", "loyal", "new"] as const;
export type Audience = (typeof AUDIENCES)[number];

function segmentWhere(rid: string, segment: Audience): SQL {
  const base = eq(customers.restaurantId, rid);
  const now = Date.now();
  switch (segment) {
    case "inactive":
      return and(base, lt(customers.lastOrderAt, new Date(now - 30 * DAY)))!;
    case "loyal":
      return and(base, gte(customers.ordersCount, 5))!;
    case "new":
      return and(base, gte(customers.createdAt, new Date(now - 30 * DAY)))!;
    default:
      return base;
  }
}

export async function listCustomers(
  db: DbOrTx,
  ctx: RestaurantContext,
  opts: { q?: string; segment?: Audience; limit?: number } = {},
) {
  assertCan(ctx, "customers.view");
  const conds: SQL[] = [segmentWhere(ctx.restaurant.id, opts.segment ?? "all")];
  const q = asciiDigits(opts.q ?? "").trim();
  if (q) conds.push(or(ilike(customers.phone, `%${q}%`), ilike(customers.name, `%${q}%`))!);
  return db
    .select()
    .from(customers)
    .where(and(...conds))
    .orderBy(desc(customers.lastOrderAt), desc(customers.createdAt))
    .limit(opts.limit ?? 200);
}

export async function customerStats(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "customers.view");
  const since = new Date(Date.now() - 30 * DAY);
  const [row] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      active: sql<number>`count(*) filter (where ${customers.lastOrderAt} >= ${since})`.mapWith(Number),
      points: sql<number>`coalesce(sum(${customers.points}), 0)`.mapWith(Number),
      spent: sql<number>`coalesce(sum(${customers.totalSpentCents}), 0)`.mapWith(Number),
    })
    .from(customers)
    .where(eq(customers.restaurantId, ctx.restaurant.id));
  return row ?? { total: 0, active: 0, points: 0, spent: 0 };
}

export async function getCustomer(db: DbOrTx, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "customers.view");
  if (!isUuid(id)) throw notFound();
  const [c] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.restaurantId, ctx.restaurant.id)));
  if (!c) throw notFound();
  const [recent, ledger] = await Promise.all([
    db
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        totalCents: orders.totalCents,
        placedAt: orders.placedAt,
      })
      .from(orders)
      .where(and(eq(orders.customerId, c.id), eq(orders.restaurantId, ctx.restaurant.id)))
      .orderBy(desc(orders.placedAt))
      .limit(20),
    db
      .select()
      .from(loyaltyEntries)
      .where(eq(loyaltyEntries.customerId, c.id))
      .orderBy(desc(loyaltyEntries.createdAt))
      .limit(30),
  ]);
  return { customer: c, orders: recent, ledger };
}

/** Till lookup by phone: the customer (if known) and what a point is worth. */
export async function lookupCustomer(db: DbOrTx, ctx: RestaurantContext, phone: string) {
  assertCan(ctx, "orders.create");
  const n = normalizeIranMobile(phone);
  const cfg = await loyaltyConfig(db, ctx.restaurant.id);
  if (!n) return { customer: null, addresses: [], ...cfg };
  const [c] = await db
    .select({
      id: customers.id,
      name: customers.name,
      points: customers.points,
      ordersCount: customers.ordersCount,
      creditLimitCents: customers.creditLimitCents,
      balanceCents: customers.balanceCents,
    })
    .from(customers)
    .where(and(eq(customers.restaurantId, ctx.restaurant.id), eq(customers.phone, n)));
  const addresses = c ? await listAddresses(db, ctx.restaurant.id, c.id) : [];
  return { customer: c ?? null, addresses, ...cfg };
}

export const customerSchema = z.object({
  phone: z
    .string()
    .trim()
    .max(32)
    .transform((v, c) => {
      const n = normalizeIranMobile(v);
      if (!n) c.addIssue({ code: "custom", message: "invalid_phone" });
      return n ?? "";
    }),
  name: z.string().trim().max(120).default(""),
  note: z.string().trim().max(1000).default(""),
  smsOptOut: z.boolean().default(false),
});

export async function createCustomer(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof customerSchema>,
) {
  assertCan(ctx, "customers.manage");
  const input = customerSchema.parse(raw);
  const [c] = await db
    .insert(customers)
    .values({
      restaurantId: ctx.restaurant.id,
      phone: input.phone,
      name: input.name || null,
      note: input.note || null,
      smsOptOut: input.smsOptOut,
    })
    .onConflictDoNothing()
    .returning();
  if (!c) throw conflict("duplicate_customer");
  return c;
}

export async function updateCustomer(
  db: Database,
  ctx: RestaurantContext,
  id: string,
  raw: Omit<z.input<typeof customerSchema>, "phone">,
) {
  assertCan(ctx, "customers.manage");
  const input = customerSchema.omit({ phone: true }).parse(raw);
  if (!isUuid(id)) throw notFound();
  const res = await db
    .update(customers)
    .set({ name: input.name || null, note: input.note || null, smsOptOut: input.smsOptOut })
    .where(and(eq(customers.id, id), eq(customers.restaurantId, ctx.restaurant.id)))
    .returning({ id: customers.id });
  if (res.length === 0) throw notFound();
}

export async function adjustPoints(db: Database, ctx: RestaurantContext, id: string, delta: number) {
  assertCan(ctx, "customers.manage");
  const d = z.number().int().min(-1_000_000).max(1_000_000).parse(delta);
  if (!isUuid(id) || d === 0) throw notFound();
  await db.transaction(async (tx) => {
    const res = await tx
      .update(customers)
      .set({ points: sql`${customers.points} + ${d}` })
      .where(
        and(
          eq(customers.id, id),
          eq(customers.restaurantId, ctx.restaurant.id),
          gte(customers.points, Math.max(0, -d)),
        ),
      )
      .returning({ id: customers.id });
    if (res.length === 0) throw conflict("points_insufficient");
    await tx.insert(loyaltyEntries).values({
      restaurantId: ctx.restaurant.id,
      customerId: id,
      kind: "adjust",
      points: d,
      actorUserId: ctx.user.id,
    });
  });
}

// ─── Coupons ─────────────────────────────────────────────────────────────────

export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,32}$/),
    kind: z.enum(["percent", "amount"]),
    value: cents.min(1),
    minOrderCents: cents.default(0),
    maxUses: z.coerce.number().int().min(1).max(1_000_000).nullable().default(null),
    endsAt: z.coerce.date().nullable().default(null),
  })
  .refine((c) => c.kind !== "percent" || c.value <= 100, { path: ["value"], message: "max_100" });

export async function listCoupons(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "customers.view");
  return db
    .select()
    .from(coupons)
    .where(eq(coupons.restaurantId, ctx.restaurant.id))
    .orderBy(desc(coupons.createdAt));
}

export async function createCoupon(db: Database, ctx: RestaurantContext, raw: z.input<typeof couponSchema>) {
  assertCan(ctx, "customers.manage");
  const input = couponSchema.parse(raw);
  const [c] = await db
    .insert(coupons)
    .values({ restaurantId: ctx.restaurant.id, ...input })
    .onConflictDoNothing()
    .returning();
  if (!c) throw conflict("duplicate_coupon");
  await recordAudit(db, {
    action: "coupon.created",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "coupon",
    entityId: c.id,
    metadata: { code: c.code, kind: c.kind, value: c.value },
  });
  return c;
}

export async function setCouponActive(db: Database, ctx: RestaurantContext, id: string, active: boolean) {
  assertCan(ctx, "customers.manage");
  if (!isUuid(id)) throw notFound();
  await db
    .update(coupons)
    .set({ isActive: active })
    .where(and(eq(coupons.id, id), eq(coupons.restaurantId, ctx.restaurant.id)));
}

export async function deleteCoupon(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "customers.manage");
  if (!isUuid(id)) throw notFound();
  await db.delete(coupons).where(and(eq(coupons.id, id), eq(coupons.restaurantId, ctx.restaurant.id)));
}

// ─── SMS campaigns ───────────────────────────────────────────────────────────

const MAX_RECIPIENTS = 5000;

export async function countAudience(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "customers.view");
  const out = {} as Record<Audience, number>;
  for (const a of AUDIENCES) {
    const [row] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(customers)
      .where(and(segmentWhere(ctx.restaurant.id, a), eq(customers.smsOptOut, false)));
    out[a] = row?.n ?? 0;
  }
  return out;
}

export const campaignSchema = z.object({
  message: z.string().trim().min(3).max(600),
  audience: z.enum(AUDIENCES),
});

/**
 * Texts a segment of the customer file. Sending is sequential and best effort: failures are
 * counted, not retried. The restaurant name heads the message and the opt-out keyword ends it.
 */
export async function sendCampaign(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof campaignSchema>,
) {
  assertCan(ctx, "customers.manage");
  const input = campaignSchema.parse(raw);
  const rid = ctx.restaurant.id;
  const recipients = await db
    .select({ phone: customers.phone })
    .from(customers)
    .where(and(segmentWhere(rid, input.audience), eq(customers.smsOptOut, false)))
    .limit(MAX_RECIPIENTS);
  if (recipients.length === 0) throw validation("no_recipients");
  const [campaign] = await db
    .insert(smsCampaigns)
    .values({
      restaurantId: rid,
      message: input.message,
      audience: input.audience,
      recipients: recipients.length,
      createdByUserId: ctx.user.id,
    })
    .returning();
  const text = `${ctx.restaurant.name}\n${input.message}\nلغو11`;
  let sent = 0;
  for (const r of recipients) {
    try {
      await sms().send(r.phone, text);
      sent++;
    } catch (e) {
      console.error("[campaign] sms failed", e instanceof Error ? e.message : e);
    }
  }
  await db.update(smsCampaigns).set({ sent }).where(eq(smsCampaigns.id, campaign!.id));
  await recordAudit(db, {
    action: "campaign.sent",
    actorUserId: ctx.user.id,
    restaurantId: rid,
    entityType: "sms_campaign",
    entityId: campaign!.id,
    metadata: { audience: input.audience, recipients: recipients.length, sent },
  });
  return { recipients: recipients.length, sent };
}

export async function listCampaigns(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "customers.view");
  return db
    .select()
    .from(smsCampaigns)
    .where(eq(smsCampaigns.restaurantId, ctx.restaurant.id))
    .orderBy(desc(smsCampaigns.createdAt))
    .limit(50);
}

// ─── House accounts (حساب اعتباری / نسیه) ──────────────────────────────────────

/** Puts an order on the customer's account, within the credit limit. */
export async function chargeAccount(
  tx: DbOrTx,
  rid: string,
  customerId: string,
  orderId: string,
  amountCents: number,
  actorUserId: string | null,
) {
  const res = await tx
    .update(customers)
    .set({ balanceCents: sql`${customers.balanceCents} + ${amountCents}` })
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.restaurantId, rid),
        sql`${customers.creditLimitCents} is not null`,
        sql`${customers.balanceCents} + ${amountCents} <= ${customers.creditLimitCents}`,
      ),
    )
    .returning({ id: customers.id });
  if (!res.length) throw conflict("credit_limit_exceeded");
  await tx.insert(customerAccountEntries).values({
    restaurantId: rid,
    customerId,
    orderId,
    kind: "charge",
    amountCents,
    actorUserId,
  });
}

export async function setCreditLimit(
  db: Database,
  ctx: RestaurantContext,
  id: string,
  limitCents: number | null,
) {
  assertCan(ctx, "customers.manage");
  if (!isUuid(id)) throw notFound();
  const limit = limitCents == null ? null : cents.parse(limitCents);
  const res = await db
    .update(customers)
    .set({ creditLimitCents: limit })
    .where(and(eq(customers.id, id), eq(customers.restaurantId, ctx.restaurant.id)))
    .returning({ id: customers.id });
  if (!res.length) throw notFound();
  await recordAudit(db, {
    action: "customer.credit_limit_set",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "customer",
    entityId: id,
    metadata: { limitCents: limit },
  });
}

export const repaymentSchema = z.object({
  amountCents: cents.min(1),
  method: z.enum(["cash", "card", "transfer"]).default("cash"),
  note: z.string().trim().max(200).default(""),
});

/** The customer pays back (part of) their account. Cash goes into the open drawer. */
export async function repayAccount(
  db: Database,
  ctx: RestaurantContext,
  id: string,
  raw: z.input<typeof repaymentSchema>,
) {
  assertCan(ctx, "payments.record");
  if (!isUuid(id)) throw notFound();
  const input = repaymentSchema.parse(raw);
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    const [c] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.restaurantId, rid)))
      .for("update");
    if (!c) throw notFound();
    if (input.amountCents > c.balanceCents)
      throw validation("repayment_too_high", { amountCents: c.balanceCents });
    await tx
      .update(customers)
      .set({ balanceCents: sql`${customers.balanceCents} - ${input.amountCents}` })
      .where(eq(customers.id, id));
    await tx.insert(customerAccountEntries).values({
      restaurantId: rid,
      customerId: id,
      kind: "payment",
      amountCents: -input.amountCents,
      method: input.method,
      note: input.note || null,
      actorUserId: ctx.user.id,
    });
    if (input.method === "cash") {
      const [shift] = await tx
        .select({ id: cashShifts.id })
        .from(cashShifts)
        .where(and(eq(cashShifts.restaurantId, rid), isNull(cashShifts.closedAt)));
      if (shift)
        await tx.insert(cashMovements).values({
          restaurantId: rid,
          shiftId: shift.id,
          direction: "in",
          amountCents: input.amountCents,
          reason: `حساب ${c.name ?? c.phone}`.slice(0, 200),
          userId: ctx.user.id,
        });
    }
    await recordAudit(tx, {
      action: "customer.account_repaid",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "customer",
      entityId: id,
      metadata: { amountCents: input.amountCents, method: input.method },
    });
    return { balanceCents: c.balanceCents - input.amountCents };
  });
}

export async function listAccountEntries(db: DbOrTx, ctx: RestaurantContext, customerId: string) {
  assertCan(ctx, "customers.view");
  return db
    .select({
      id: customerAccountEntries.id,
      kind: customerAccountEntries.kind,
      amountCents: customerAccountEntries.amountCents,
      method: customerAccountEntries.method,
      note: customerAccountEntries.note,
      createdAt: customerAccountEntries.createdAt,
      orderNumber: orders.number,
    })
    .from(customerAccountEntries)
    .leftJoin(orders, eq(orders.id, customerAccountEntries.orderId))
    .where(
      and(
        eq(customerAccountEntries.customerId, customerId),
        eq(customerAccountEntries.restaurantId, ctx.restaurant.id),
      ),
    )
    .orderBy(desc(customerAccountEntries.createdAt))
    .limit(50);
}
