import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { notifyTeam } from "@/server/modules/team/sections";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  deliveryZones,
  orderItems,
  orderStatusEvents,
  orders,
  restaurantSettings,
  restaurants,
} from "@/server/db/schema";
import { emit, topics } from "@/server/infra/realtime";
import { AppError, conflict, forbidden, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { taxFromGross, taxFromNet } from "@/lib/money";
import { isUuid, randomToken } from "@/lib/ids";
import { normalizeIranMobile } from "@/lib/phone";
import { forChannel, loadPricedProducts } from "@/server/modules/menu/public";
import { computeTotals, priceLine, type PricedLine } from "@/server/modules/pricing";
import { nextCounterValue } from "@/server/modules/restaurants/service";
import { stationsOf } from "@/server/modules/kitchen/stations";
import { nutritionOf } from "@/server/modules/nutrition/service";
import { applyOrderToStock } from "@/server/modules/inventory/service";
import { commitDiscounts, computeDiscounts, linkOrderCustomer } from "@/server/modules/customers/service";
import { getZone, rememberAddress } from "@/server/modules/delivery/service";
import { recordAudit } from "@/server/audit";
import { notifyNewOrder } from "@/server/modules/push/service";

/**
 * Online ordering (Z-6): /r/{slug}/order, a link for the Instagram bio. Takeaway or delivery,
 * paid at pickup or on delivery. The guest signs in with their mobile (SMS code) first: a
 * verified phone on every order, and the restaurant can call back. The order lands in
 * "received" like a QR order, for the team to accept.
 */
export const MAX_OPEN_ONLINE_ORDERS = 2;

export type OnlineDiner = { id: string; phone: string | null; name?: string | null };

async function storeBySlug(db: DbOrTx, slug: string) {
  const [row] = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      slug: restaurants.slug,
      currency: restaurants.currency,
      logoKey: restaurants.logoKey,
      brandColor: restaurants.brandColor,
      phone: restaurants.phone,
      status: restaurants.status,
      on: restaurantSettings.onlineOrderingEnabled,
      takeaway: restaurantSettings.onlineTakeaway,
      delivery: restaurantSettings.onlineDelivery,
      orderPrefix: restaurantSettings.orderPrefix,
      pricesIncludeTax: restaurantSettings.pricesIncludeTax,
      defaultLocale: restaurants.defaultLocale,
    })
    .from(restaurants)
    .innerJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .where(and(eq(restaurants.slug, slug), isNull(restaurants.deletedAt)));
  return row ?? null;
}

/** What the ordering page needs besides the menu: modes and delivery zones. */
export async function getOnlineStore(db: Database, slug: string) {
  const s = await storeBySlug(db, slug);
  if (!s || s.status !== "active" || !s.on || (!s.takeaway && !s.delivery)) return null;
  const zones = s.delivery
    ? await db
        .select({
          id: deliveryZones.id,
          name: deliveryZones.name,
          feeCents: deliveryZones.feeCents,
          minOrderCents: deliveryZones.minOrderCents,
        })
        .from(deliveryZones)
        .where(
          and(
            eq(deliveryZones.restaurantId, s.id),
            eq(deliveryZones.isActive, true),
            isNull(deliveryZones.deletedAt),
          ),
        )
        .orderBy(asc(deliveryZones.sortOrder), asc(deliveryZones.name))
    : [];
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    currency: s.currency,
    logoKey: s.logoKey,
    brandColor: s.brandColor,
    phone: s.phone,
    takeaway: s.takeaway,
    delivery: s.delivery && zones.length > 0,
    zones,
  };
}

export const onlineOrderSchema = z.object({
  channel: z.enum(["takeaway", "delivery"]),
  lines: z
    .array(
      z.object({
        productId: z.uuid(),
        optionValueIds: z.array(z.uuid()).max(50).default([]),
        quantity: z.number().int().min(1).max(30),
        note: z.string().trim().max(280).default(""),
      }),
    )
    .min(1)
    .max(60),
  customerName: z.string().trim().min(1).max(120),
  deliveryAddress: z.string().trim().max(500).default(""),
  deliveryZoneId: z.uuid().nullable().optional(),
  note: z.string().trim().max(500).default(""),
  couponCode: z.string().trim().max(32).default(""),
});

export async function placeOnlineOrder(db: Database, diner: OnlineDiner, slug: string, raw: unknown) {
  if (!diner.phone) throw forbidden("phone_required");
  const input = onlineOrderSchema.parse(raw);
  const store = await storeBySlug(db, slug);
  if (!store || store.status !== "active" || !store.on) throw notFound();
  if (input.channel === "takeaway" && !store.takeaway) throw forbidden("channel_disabled");
  if (input.channel === "delivery") {
    if (!store.delivery) throw forbidden("channel_disabled");
    if (input.deliveryAddress.length < 5)
      throw new AppError("VALIDATION", "address_required", { field: "address" });
    if (!input.deliveryZoneId) throw new AppError("VALIDATION", "zone_required", { field: "zone" });
  }
  return insertGuestOrder(db, store, input, { dinerId: diner.id, phone: diner.phone, source: "online" });
}

type Store = NonNullable<Awaited<ReturnType<typeof storeBySlug>>>;
type GuestOrderInput = Omit<z.output<typeof onlineOrderSchema>, "channel"> & {
  channel: "dine_in" | "takeaway" | "delivery";
};

/** Shared by the online site and the kiosk: prices from the database, order "received". */
async function insertGuestOrder(
  db: Database,
  store: Store,
  input: GuestOrderInput,
  who: { dinerId: string | null; phone: string | null; source: "online" | "kiosk" },
) {
  const rid = store.id;
  const phone = who.phone;

  const placed = await db.transaction(async (tx) => {
    // Few orders may wait for the team at once, per guest.
    if (who.dinerId) {
      const open = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.restaurantId, rid),
            eq(orders.dinerId, who.dinerId),
            inArray(orders.status, ["received", "pending_payment"]),
          ),
        );
      if (open.length >= MAX_OPEN_ONLINE_ORDERS) throw conflict("too_many_pending");
    }

    const products = await loadPricedProducts(tx, rid, {
      productIds: [...new Set(input.lines.map((l) => l.productId))],
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const lines: {
      item: (typeof input.lines)[number];
      line: PricedLine;
      name: string;
      categoryId: string;
      categoryName: string;
    }[] = [];
    for (const item of input.lines) {
      const base = byId.get(item.productId);
      const product = base ? forChannel(base, input.channel) : undefined;
      const priced = product ? priceLine(product, item.optionValueIds, item.quantity) : null;
      if (!product || !priced?.ok) throw conflict("product_unavailable", { productId: item.productId });
      lines.push({
        item,
        line: priced.line,
        name: product.name,
        categoryId: product.categoryId,
        categoryName: product.categoryName,
      });
    }
    const pricesIncludeTax = store.pricesIncludeTax;
    const totals = computeTotals(
      lines.map((l) => l.line),
      pricesIncludeTax,
    );
    const extra = await computeDiscounts(tx, rid, {
      totalCents: totals.totalCents,
      couponCode: input.couponCode,
      redeemPoints: 0,
      customer: null,
    });
    if (input.couponCode && !extra.couponId)
      throw new AppError("VALIDATION", "coupon_invalid", { field: "coupon" });
    const zone = input.channel === "delivery" ? await getZone(tx, rid, input.deliveryZoneId!) : null;
    if (input.channel === "delivery" && !zone)
      throw new AppError("VALIDATION", "zone_required", { field: "zone" });
    if (zone && totals.totalCents - extra.discountCents < zone.minOrderCents)
      throw new AppError("VALIDATION", "below_zone_minimum", { amountCents: zone.minOrderCents });
    const deliveryFeeCents = zone?.feeCents ?? 0;
    const totalCents = totals.totalCents - extra.discountCents + deliveryFeeCents;
    const taxCents =
      totals.totalCents > 0
        ? Math.round(totals.taxCents * ((totalCents - deliveryFeeCents) / totals.totalCents))
        : 0;
    const seq = await nextCounterValue(tx, rid, "order", 1001);
    const number = `${store.orderPrefix ?? "A"}-${seq}`;

    const [order] = await tx
      .insert(orders)
      .values({
        restaurantId: rid,
        number,
        seq,
        channel: input.channel,
        status: "received",
        paymentStatus: "unpaid",
        currency: store.currency,
        subtotalCents: totals.subtotalCents,
        discountCents: extra.discountCents,
        taxCents,
        totalCents,
        pricesIncludeTax,
        note: [input.customerName, input.note].filter(Boolean).join(" · ").slice(0, 500) || null,
        customerPhone: phone,
        dinerId: who.dinerId,
        ...(input.channel === "delivery"
          ? { deliveryAddress: input.deliveryAddress, deliveryZoneId: zone?.id ?? null, deliveryFeeCents }
          : {}),
      })
      .returning();

    const productIds = lines.map((l) => l.item.productId);
    const [stations, nutrition] = await Promise.all([
      stationsOf(tx, rid, productIds),
      nutritionOf(tx, rid, productIds),
    ]);
    await tx.insert(orderItems).values(
      lines.map(({ item, line, name, categoryId, categoryName }) => ({
        restaurantId: rid,
        orderId: order!.id,
        productId: item.productId,
        categoryId,
        productName: name,
        categoryName,
        stationId: stations.get(item.productId) ?? null,
        nutrition: nutrition.get(item.productId) ?? null,
        unitPriceCents: line.unitPriceCents,
        optionsTotalCents: line.optionsTotalCents,
        quantity: line.quantity,
        lineTotalCents: line.lineTotalCents,
        taxRateBps: line.taxRateBps,
        taxCents: pricesIncludeTax
          ? taxFromGross(line.lineTotalCents, line.taxRateBps)
          : taxFromNet(line.lineTotalCents, line.taxRateBps),
        options: line.selections,
        note: item.note || null,
      })),
    );
    await tx.insert(orderStatusEvents).values({
      restaurantId: rid,
      orderId: order!.id,
      fromStatus: null,
      toStatus: "received",
      actorUserId: null,
    });
    await applyOrderToStock(tx, rid, order!.id, -1);
    const customer = phone ? await linkOrderCustomer(tx, rid, order!.id, phone, input.customerName) : null;
    if (customer && input.channel === "delivery")
      await rememberAddress(tx, rid, customer.id, input.deliveryAddress, zone?.id ?? null);
    await commitDiscounts(
      tx,
      rid,
      order!.id,
      { couponId: extra.couponId, pointsRedeemed: 0, customerId: customer?.id ?? null },
      null,
    );

    const sections = await notifyTeam(
      tx,
      {
        restaurantId: rid,
        type: "order.created",
        payload: { orderId: order!.id, number, tableLabel: null, totalCents, source: who.source },
      },
      { orderId: order!.id },
    );
    await emit(tx, {
      topic: topics.restaurant(rid),
      type: "order.created",
      data: {
        orderId: order!.id,
        number,
        tableId: null,
        tableLabel: "",
        source: who.source,
        ...(sections ? { sections } : {}),
      },
    });
    return order!;
  });
  notifyNewOrder(
    db,
    { id: store.id, defaultLocale: store.defaultLocale },
    { id: placed.id, number: placed.number, tableLabel: null },
  );
  return placed;
}

/** The guest's own order, for the tracking page. */
export async function getOnlineOrder(db: Database, dinerId: string, slug: string, orderId: string) {
  if (!isUuid(orderId)) return null;
  const [row] = await db
    .select({
      order: orders,
      restaurantName: restaurants.name,
      restaurantPhone: restaurants.phone,
      logoKey: restaurants.logoKey,
      brandColor: restaurants.brandColor,
    })
    .from(orders)
    .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
    .where(and(eq(orders.id, orderId), eq(orders.dinerId, dinerId), eq(restaurants.slug, slug)));
  if (!row) return null;
  const items = await db
    .select({
      name: orderItems.productName,
      quantity: orderItems.quantity,
      lineTotalCents: orderItems.lineTotalCents,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.createdAt));
  return { ...row, items };
}

// ── Dashboard settings ────────────────────────────────────────────────────────

export const onlineSettingsSchema = z.object({
  onlineOrderingEnabled: z.boolean(),
  onlineTakeaway: z.boolean(),
  onlineDelivery: z.boolean(),
});

export async function getOnlineSettings(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  const [s] = await db
    .select({
      onlineOrderingEnabled: restaurantSettings.onlineOrderingEnabled,
      onlineTakeaway: restaurantSettings.onlineTakeaway,
      onlineDelivery: restaurantSettings.onlineDelivery,
    })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  if (!s) throw notFound();
  return s;
}

export async function updateOnlineSettings(db: Database, ctx: RestaurantContext, raw: unknown) {
  assertCan(ctx, "restaurant.manage");
  const input = onlineSettingsSchema.parse(raw);
  await db
    .update(restaurantSettings)
    .set(input)
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  await recordAudit(db, {
    action: "restaurant.settings_updated",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    metadata: { online: input },
  });
}

// ── Kiosk ─────────────────────────────────────────────────────────────────────

/** The kiosk link carries the restaurant's kiosk token: whoever holds the tablet may order. */
async function storeByKiosk(db: DbOrTx, token: string) {
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(token)) return null;
  const [row] = await db
    .select({ slug: restaurants.slug, enabled: restaurantSettings.kioskEnabled })
    .from(restaurantSettings)
    .innerJoin(restaurants, eq(restaurants.id, restaurantSettings.restaurantId))
    .where(and(eq(restaurantSettings.kioskToken, token), isNull(restaurants.deletedAt)));
  if (!row?.enabled) return null;
  const store = await storeBySlug(db, row.slug);
  return store && store.status === "active" ? store : null;
}

export async function getKioskStore(db: Database, token: string) {
  const s = await storeByKiosk(db, token);
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    currency: s.currency,
    logoKey: s.logoKey,
    brandColor: s.brandColor,
  };
}

export const kioskOrderSchema = onlineOrderSchema.extend({
  channel: z.enum(["dine_in", "takeaway"]),
  phone: z.string().trim().max(32).default(""),
});

export async function placeKioskOrder(db: Database, token: string, raw: unknown) {
  const store = await storeByKiosk(db, token);
  if (!store) throw notFound();
  const { phone: rawPhone, ...input } = kioskOrderSchema.parse(raw);
  const phone = rawPhone ? normalizeIranMobile(rawPhone) : null;
  if (rawPhone && !phone) throw new AppError("VALIDATION", "invalid_phone", { field: "phone" });
  return insertGuestOrder(
    db,
    store,
    { ...input, deliveryAddress: "", deliveryZoneId: null },
    {
      dinerId: null,
      phone,
      source: "kiosk",
    },
  );
}

export async function getKioskSettings(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  const [s] = await db
    .select({ enabled: restaurantSettings.kioskEnabled, token: restaurantSettings.kioskToken })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  return s ?? { enabled: false, token: null };
}

/** On/off; a new link (old tablets stop working) when `regenerate`. */
export async function updateKiosk(
  db: Database,
  ctx: RestaurantContext,
  opts: { enabled: boolean; regenerate?: boolean },
) {
  assertCan(ctx, "restaurant.manage");
  const current = await getKioskSettings(db, ctx);
  const token = opts.regenerate || !current.token ? randomToken(24) : current.token;
  await db
    .update(restaurantSettings)
    .set({ kioskEnabled: opts.enabled, kioskToken: token })
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  await recordAudit(db, {
    action: "restaurant.settings_updated",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    metadata: { kiosk: opts.enabled, regenerated: Boolean(opts.regenerate) },
  });
  return { enabled: opts.enabled, token };
}
