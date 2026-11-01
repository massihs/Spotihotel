import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { categories, kitchenStations, orderItems, orders, printers, products } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";

export const STATION_COLORS = [
  "orange",
  "rose",
  "sky",
  "emerald",
  "amber",
  "violet",
  "teal",
  "fuchsia",
] as const;

/**
 * Where each dish is prepared: its own station if set, else its category's (null = every
 * screen). Stored on the order line when ordered, so later menu changes never move a ticket.
 */
export async function stationsOf(db: DbOrTx, rid: string, productIds: string[]) {
  if (!productIds.length) return new Map<string, string | null>();
  const rows = await db
    .select({
      id: products.id,
      stationId: sql<string | null>`coalesce(${products.stationId}, ${categories.stationId})`,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.restaurantId, rid), inArray(products.id, [...new Set(productIds)])));
  return new Map(rows.map((r) => [r.id, r.stationId]));
}

const live = (rid: string) => and(eq(kitchenStations.restaurantId, rid), isNull(kitchenStations.deletedAt));

/** Stations with the categories they prepare. */
export async function listStations(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "orders.view");
  const [stations, cats] = await Promise.all([
    db
      .select()
      .from(kitchenStations)
      .where(live(ctx.restaurant.id))
      .orderBy(asc(kitchenStations.sortOrder), asc(kitchenStations.createdAt)),
    db
      .select({ id: categories.id, name: categories.name, stationId: categories.stationId })
      .from(categories)
      .where(and(eq(categories.restaurantId, ctx.restaurant.id), isNull(categories.deletedAt)))
      .orderBy(asc(categories.sortOrder)),
  ]);
  return { stations, categories: cats };
}

export const stationSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.enum(STATION_COLORS).default("orange"),
  categoryIds: z.array(z.uuid()).max(200).default([]),
});

/** Creates or updates a station and (re)assigns its categories. */
export async function saveStation(
  db: Database,
  ctx: RestaurantContext,
  id: string | null,
  raw: z.input<typeof stationSchema>,
) {
  assertCan(ctx, "menu.manage");
  const input = stationSchema.parse(raw);
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    let stationId = id;
    if (id) {
      if (!isUuid(id)) throw notFound();
      const res = await tx
        .update(kitchenStations)
        .set({ name: input.name, color: input.color })
        .where(and(eq(kitchenStations.id, id), live(rid)))
        .returning({ id: kitchenStations.id });
      if (!res.length) throw notFound();
    } else {
      const [s] = await tx
        .insert(kitchenStations)
        .values({ restaurantId: rid, name: input.name, color: input.color })
        .returning({ id: kitchenStations.id });
      stationId = s!.id;
    }
    await tx
      .update(categories)
      .set({ stationId: null })
      .where(and(eq(categories.restaurantId, rid), eq(categories.stationId, stationId!)));
    if (input.categoryIds.length)
      await tx
        .update(categories)
        .set({ stationId })
        .where(and(eq(categories.restaurantId, rid), inArray(categories.id, input.categoryIds)));
    await recordAudit(tx, {
      action: id ? "station.updated" : "station.created",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "kitchen_station",
      entityId: stationId!,
      metadata: { name: input.name, categories: input.categoryIds.length },
    });
    return stationId!;
  });
}

export async function deleteStation(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "menu.manage");
  if (!isUuid(id)) throw notFound();
  await db.transaction(async (tx) => {
    await tx
      .update(kitchenStations)
      .set({ deletedAt: new Date() })
      .where(and(eq(kitchenStations.id, id), live(ctx.restaurant.id)));
    await tx
      .update(categories)
      .set({ stationId: null })
      .where(and(eq(categories.restaurantId, ctx.restaurant.id), eq(categories.stationId, id)));
  });
}

/** A kitchen ticket: the order with only this station's items (all items when no station). */
export async function getTicket(
  db: DbOrTx,
  ctx: RestaurantContext,
  orderId: string,
  stationId: string | null,
) {
  assertCan(ctx, "orders.view");
  if (!isUuid(orderId)) throw notFound();
  const [o] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, ctx.restaurant.id)));
  if (!o) throw notFound();
  const items = await db
    .select({
      id: orderItems.id,
      quantity: orderItems.quantity,
      productName: orderItems.productName,
      options: orderItems.options,
      note: orderItems.note,
      lineTotalCents: orderItems.lineTotalCents,
      stationId: orderItems.stationId,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, o.id))
    .orderBy(asc(orderItems.createdAt));
  let station: { name: string } | null = null;
  if (stationId && isUuid(stationId)) {
    const [s] = await db
      .select({ name: kitchenStations.name })
      .from(kitchenStations)
      .where(and(eq(kitchenStations.id, stationId), live(ctx.restaurant.id)));
    station = s ?? null;
  }
  return {
    order: o,
    station,
    items: station ? items.filter((i) => i.stationId === stationId) : items,
  };
}

// ─── Routing: which station prepares what ────────────────────────────────────

/** Templates and names that are drinks: they go to the bar. */
const DRINK_TEMPLATES = new Set(["coffee", "tea", "soft_drinks", "cocktails", "wines", "beers"]);
const DRINK_NAME =
  /نوشیدنی|نوشابه|قهوه|کافه|اسپرسو|چای|دمنوش|آبمیوه|آب میوه|شیک|اسموتی|موکتل|کوکتل|لیموناد|مشروب|(?<![a-zà-ÿ])(drinks?|boissons?|caf[ée]s?|coffee|teas?|th[ée]s?|jus|juices?|smoothies?|shakes?|cocktails?|mocktails?|bar|bi[èe]res?|beers?|wines?|vins?|sodas?|lemonade|limonade)(?![a-zà-ÿ])|مشروبات|عصير|قهوة/i;

export const isDrinkCategory = (c: { name: string; templateKey?: string | null }) =>
  (c.templateKey != null && DRINK_TEMPLATES.has(c.templateKey)) || DRINK_NAME.test(c.name);

/** Everything the routing screen shows: stations (with their printers), categories, dishes. */
export async function routingView(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "menu.view");
  const rid = ctx.restaurant.id;
  const [stations, cats, dishes, printerRows] = await Promise.all([
    db
      .select({ id: kitchenStations.id, name: kitchenStations.name, color: kitchenStations.color })
      .from(kitchenStations)
      .where(live(rid))
      .orderBy(asc(kitchenStations.sortOrder), asc(kitchenStations.createdAt)),
    db
      .select({
        id: categories.id,
        name: categories.name,
        icon: categories.icon,
        templateKey: categories.templateKey,
        stationId: categories.stationId,
      })
      .from(categories)
      .where(and(eq(categories.restaurantId, rid), isNull(categories.deletedAt)))
      .orderBy(asc(categories.sortOrder), asc(categories.createdAt)),
    db
      .select({
        id: products.id,
        name: products.name,
        categoryId: products.categoryId,
        stationId: products.stationId,
      })
      .from(products)
      .where(and(eq(products.restaurantId, rid), isNull(products.deletedAt)))
      .orderBy(asc(products.sortOrder), asc(products.createdAt)),
    db
      .select({ name: printers.name, target: printers.target, stationId: printers.stationId })
      .from(printers)
      .where(and(eq(printers.restaurantId, rid), eq(printers.isActive, true), isNull(printers.deletedAt))),
  ]);
  const known = new Set(stations.map((s) => s.id));
  return {
    stations: stations.map((s) => ({
      ...s,
      printers: printerRows
        .filter((p) => p.target === "all" || (p.target === "station" && p.stationId === s.id))
        .map((p) => p.name),
    })),
    categories: cats.map((c) => ({
      ...c,
      // A station deleted since: the category goes back to every screen.
      stationId: c.stationId && known.has(c.stationId) ? c.stationId : null,
      drink: isDrinkCategory(c),
    })),
    products: dishes.map((p) => ({
      ...p,
      stationId: p.stationId && known.has(p.stationId) ? p.stationId : null,
    })),
  };
}

async function ownStation(db: DbOrTx, rid: string, stationId: string | null) {
  if (stationId === null) return null;
  if (!isUuid(stationId)) throw notFound();
  const [s] = await db
    .select({ id: kitchenStations.id })
    .from(kitchenStations)
    .where(and(eq(kitchenStations.id, stationId), live(rid)));
  if (!s) throw notFound();
  return s.id;
}

/** A whole category goes to this station (null = shown on every screen). */
export async function setCategoryStation(
  db: Database,
  ctx: RestaurantContext,
  categoryId: string,
  stationId: string | null,
) {
  assertCan(ctx, "menu.manage");
  if (!isUuid(categoryId)) throw notFound();
  const sid = await ownStation(db, ctx.restaurant.id, stationId);
  const res = await db
    .update(categories)
    .set({ stationId: sid })
    .where(and(eq(categories.id, categoryId), eq(categories.restaurantId, ctx.restaurant.id)))
    .returning({ id: categories.id });
  if (!res.length) throw notFound();
}

/** One dish goes elsewhere than its category (null = follows its category again). */
export async function setProductStation(
  db: Database,
  ctx: RestaurantContext,
  productId: string,
  stationId: string | null,
) {
  assertCan(ctx, "menu.manage");
  if (!isUuid(productId)) throw notFound();
  const sid = await ownStation(db, ctx.restaurant.id, stationId);
  const res = await db
    .update(products)
    .set({ stationId: sid })
    .where(and(eq(products.id, productId), eq(products.restaurantId, ctx.restaurant.id)))
    .returning({ id: products.id });
  if (!res.length) throw notFound();
}

/**
 * One click for the usual setup: a Kitchen and a Bar station (reused when they exist), drinks
 * to the bar and the rest to the kitchen. Categories already sent somewhere are left alone.
 */
export async function setupKitchenAndBar(
  db: Database,
  ctx: RestaurantContext,
  names: { kitchen: string; bar: string },
) {
  assertCan(ctx, "menu.manage");
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: kitchenStations.id, name: kitchenStations.name })
      .from(kitchenStations)
      .where(live(rid));
    const find = (re: RegExp, label: string) =>
      existing.find((s) => s.name.trim() === label || re.test(s.name))?.id ?? null;
    const ensure = async (id: string | null, name: string, color: (typeof STATION_COLORS)[number]) =>
      id ??
      (
        await tx
          .insert(kitchenStations)
          .values({ restaurantId: rid, name, color })
          .returning({ id: kitchenStations.id })
      )[0]!.id;
    const kitchen = await ensure(
      find(/آشپزخانه|cuisine|kitchen|مطبخ/i, names.kitchen),
      names.kitchen,
      "orange",
    );
    const bar = await ensure(find(/\bbar\b|^بار|کافه|café|coffee|مشروبات/i, names.bar), names.bar, "sky");
    const cats = await tx
      .select({
        id: categories.id,
        name: categories.name,
        templateKey: categories.templateKey,
        stationId: categories.stationId,
      })
      .from(categories)
      .where(and(eq(categories.restaurantId, rid), isNull(categories.deletedAt)));
    const known = new Set(existing.map((s) => s.id));
    let toBar = 0;
    let toKitchen = 0;
    for (const c of cats) {
      if (c.stationId && known.has(c.stationId)) continue;
      const drink = isDrinkCategory(c);
      await tx
        .update(categories)
        .set({ stationId: drink ? bar : kitchen })
        .where(eq(categories.id, c.id));
      if (drink) toBar++;
      else toKitchen++;
    }
    await recordAudit(tx, {
      action: "station.auto_setup",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "kitchen_station",
      entityId: kitchen,
      metadata: { toBar, toKitchen },
    });
    return { kitchen, bar, toBar, toKitchen };
  });
}
