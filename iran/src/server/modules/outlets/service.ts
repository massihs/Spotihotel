import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { categories, diningTables, outlets } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { dayStart, localDay } from "@/lib/period";
import { bulkCreateTables } from "@/server/modules/tables/service";
import { menuTag } from "@/server/modules/menu/cache";

/** The kinds of points of sale a hotel runs (each has its icon and default table prefix). */
export const OUTLET_KINDS = ["restaurant", "cafe", "bar", "lounge", "pool_bar", "pastry"] as const;
export type OutletKind = (typeof OUTLET_KINDS)[number];
const PREFIX: Record<OutletKind, string> = {
  restaurant: "R",
  cafe: "C",
  bar: "B",
  lounge: "L",
  pool_bar: "P",
  pastry: "S",
};

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

export const outletSchema = z.object({
  name: z.string().trim().min(2).max(80),
  kind: z.enum(OUTLET_KINDS).default("restaurant"),
  location: optText(80),
  hours: optText(40),
});

/** Creation also lays out the outlet's tables, so it can take orders at once. */
export const newOutletSchema = outletSchema.extend({
  tables: z.coerce.number().int().min(0).max(200).default(0),
  /** Label prefix of its tables ("C" → C1, C2…); defaults to one per kind, made unique. */
  tablePrefix: z
    .string()
    .trim()
    .max(8)
    .transform((v) => v || null)
    .nullable()
    .optional(),
  seats: z.coerce.number().int().min(1).max(30).default(4),
});

/** Every active outlet with its tables and today's figures (orders and sales). */
export async function listOutlets(db: DbOrTx, ctx: RestaurantContext, now = new Date()) {
  assertCan(ctx, "tables.view");
  const rid = ctx.restaurant.id;
  const since = dayStart(localDay(now, ctx.restaurant.timezone), ctx.restaurant.timezone);
  const rows = await db
    .select({
      outlet: outlets,
      tables: sql<number>`(select count(*)::int from dining_tables t where t.outlet_id = outlets.id and t.deleted_at is null)`,
      openTables: sql<number>`(select count(distinct s.table_id)::int from table_sessions s join dining_tables t on t.id = s.table_id where t.outlet_id = outlets.id and s.status = 'open')`,
      categories: sql<number>`(select count(*)::int from categories c where c.restaurant_id = ${rid} and c.deleted_at is null and outlets.id = any(c.outlet_ids))`,
      ordersToday: sql<number>`(select count(*)::int from orders o left join dining_tables t on t.id = o.table_id where o.restaurant_id = ${rid} and coalesce(o.outlet_id, t.outlet_id) = outlets.id and o.created_at >= ${since.toISOString()} and o.status <> 'cancelled')`,
      salesToday: sql<number>`(select coalesce(sum(o.total_cents),0)::bigint from orders o left join dining_tables t on t.id = o.table_id where o.restaurant_id = ${rid} and coalesce(o.outlet_id, t.outlet_id) = outlets.id and o.created_at >= ${since.toISOString()} and o.status <> 'cancelled')`.mapWith(
        Number,
      ),
    })
    .from(outlets)
    .where(and(eq(outlets.restaurantId, rid), isNull(outlets.deletedAt)))
    .orderBy(asc(outlets.sortOrder), asc(outlets.createdAt));
  return rows.map(({ outlet, ...stats }) => ({ ...outlet, ...stats }));
}

export async function getOutlet(db: DbOrTx, restaurantId: string, outletId: string) {
  if (!isUuid(outletId)) return null;
  const [o] = await db
    .select()
    .from(outlets)
    .where(and(eq(outlets.id, outletId), eq(outlets.restaurantId, restaurantId), isNull(outlets.deletedAt)));
  return o ?? null;
}

/** A free table-label prefix for a new outlet: "C", then "C2-", "C3-"… if already used. */
async function freePrefix(db: DbOrTx, restaurantId: string, wanted: string) {
  const labels = await db
    .select({ label: sql<string>`lower(${diningTables.label})` })
    .from(diningTables)
    .where(and(eq(diningTables.restaurantId, restaurantId), isNull(diningTables.deletedAt)));
  const taken = (p: string) => labels.some((l) => l.label.startsWith(p.toLowerCase()) && /^\d+$/.test(l.label.slice(p.length)));
  if (!taken(wanted)) return wanted;
  for (let n = 2; n < 100; n++) if (!taken(`${wanted}${n}-`)) return `${wanted}${n}-`;
  return `${wanted}${Date.now() % 1000}-`;
}

/**
 * Opens a restaurant, café or bar of the hotel in one step: the outlet and its tables (each with
 * its QR code), numbered with their own prefix.
 */
export async function createOutlet(db: Database, ctx: RestaurantContext, raw: z.input<typeof newOutletSchema>) {
  assertCan(ctx, "tables.manage");
  const input = newOutletSchema.parse(raw);
  const rid = ctx.restaurant.id;
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(outlets)
    .where(and(eq(outlets.restaurantId, rid), isNull(outlets.deletedAt)));
  const [outlet] = await db
    .insert(outlets)
    .values({
      restaurantId: rid,
      name: input.name,
      kind: input.kind,
      location: input.location ?? null,
      hours: input.hours ?? null,
      sortOrder: n,
    })
    .returning();
  let prefix: string | null = null;
  if (input.tables > 0) {
    prefix = input.tablePrefix ?? (await freePrefix(db, rid, PREFIX[input.kind]));
    await bulkCreateTables(
      db,
      ctx,
      { from: 1, to: input.tables, prefix, kind: "table", zone: input.name, capacity: input.seats },
      { outletId: outlet!.id },
    );
  }
  await recordAudit(db, {
    action: "outlet.created",
    actorUserId: ctx.user.id,
    restaurantId: rid,
    entityType: "outlet",
    entityId: outlet!.id,
    metadata: { name: input.name, kind: input.kind, tables: input.tables, prefix },
  });
  return { ...outlet!, prefix };
}

export async function updateOutlet(
  db: Database,
  ctx: RestaurantContext,
  outletId: string,
  raw: z.input<typeof outletSchema>,
) {
  assertCan(ctx, "tables.manage");
  const input = outletSchema.parse(raw);
  const current = await getOutlet(db, ctx.restaurant.id, outletId);
  if (!current) throw notFound();
  await db
    .update(outlets)
    .set({ name: input.name, kind: input.kind, location: input.location ?? null, hours: input.hours ?? null })
    .where(eq(outlets.id, current.id));
  // Its tables follow the new name on the floor plan.
  if (current.name !== input.name)
    await db
      .update(diningTables)
      .set({ zone: input.name })
      .where(and(eq(diningTables.outletId, current.id), eq(diningTables.zone, current.name)));
}

/** Adds tables to an outlet (a terrace opens for the summer…). */
export async function addOutletTables(
  db: Database,
  ctx: RestaurantContext,
  outletId: string,
  raw: { tables: number; seats?: number },
) {
  assertCan(ctx, "tables.manage");
  const outlet = await getOutlet(db, ctx.restaurant.id, outletId);
  if (!outlet) throw notFound();
  const count = z.coerce.number().int().min(1).max(200).parse(raw.tables);
  const seats = z.coerce.number().int().min(1).max(30).default(4).parse(raw.seats);
  // Continue the outlet's numbering with its existing prefix.
  const existing = await db
    .select({ label: diningTables.label, number: diningTables.number })
    .from(diningTables)
    .where(and(eq(diningTables.outletId, outlet.id), isNull(diningTables.deletedAt)));
  const sample = existing.find((t) => t.number != null);
  const prefix = sample
    ? sample.label.slice(0, sample.label.length - String(sample.number).length)
    : await freePrefix(db, ctx.restaurant.id, PREFIX[outlet.kind as OutletKind] ?? "T");
  const from = Math.max(0, ...existing.map((t) => t.number ?? 0)) + 1;
  return bulkCreateTables(
    db,
    ctx,
    { from, to: from + count - 1, prefix, kind: "table", zone: outlet.name, capacity: seats },
    { outletId: outlet.id },
  );
}

/** Closes an outlet: it leaves the lists; its tables and past sales stay. */
export async function archiveOutlet(db: Database, ctx: RestaurantContext, outletId: string) {
  assertCan(ctx, "tables.manage");
  const outlet = await getOutlet(db, ctx.restaurant.id, outletId);
  if (!outlet) throw notFound();
  await db.update(outlets).set({ deletedAt: new Date(), isActive: false }).where(eq(outlets.id, outlet.id));
  await recordAudit(db, {
    action: "outlet.archived",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "outlet",
    entityId: outlet.id,
    metadata: { name: outlet.name },
  });
}

/** Menu categories of the establishment, with the outlets each one is served in. */
export async function categoriesWithOutlets(db: DbOrTx, restaurantId: string) {
  return db
    .select({ id: categories.id, name: categories.name, outletIds: categories.outletIds })
    .from(categories)
    .where(and(eq(categories.restaurantId, restaurantId), isNull(categories.deletedAt)))
    .orderBy(asc(categories.sortOrder));
}

/**
 * Sets an outlet's menu: the chosen categories are served there (as well as in the other outlets
 * they already belong to); the others no longer are. A category no outlet claims is shared by all.
 */
export async function setOutletMenu(
  db: Database,
  ctx: RestaurantContext,
  outletId: string,
  categoryIds: string[],
  revalidate: (tag: string) => void = () => {},
) {
  assertCan(ctx, "menu.manage");
  const outlet = await getOutlet(db, ctx.restaurant.id, outletId);
  if (!outlet) throw notFound();
  const wanted = new Set(categoryIds.filter(isUuid));
  const all = await categoriesWithOutlets(db, ctx.restaurant.id);
  await db.transaction(async (tx) => {
    for (const c of all) {
      const has = c.outletIds.includes(outlet.id);
      if (wanted.has(c.id) === has) continue;
      const next = has ? c.outletIds.filter((x) => x !== outlet.id) : [...c.outletIds, outlet.id];
      await tx.update(categories).set({ outletIds: next }).where(eq(categories.id, c.id));
    }
  });
  revalidate(menuTag(ctx.restaurant.id));
}

/**
 * Sales per point of sale over a period (local days, inclusive): every restaurant, café and bar,
 * room service (orders from rooms) and what no outlet took (counter, delivery…). Cancelled
 * orders are left out.
 */
export async function outletSales(db: DbOrTx, ctx: RestaurantContext, from: string, to: string) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const tz = ctx.restaurant.timezone;
  const start = dayStart(from, tz).toISOString();
  const [y, m, d] = to.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
  const end = dayStart(next, tz).toISOString();
  const rows = await db.execute<{ key: string; orders: number; cents: string; guests: number }>(sql`
    select
      case
        when coalesce(o.outlet_id, t.outlet_id) is not null then coalesce(o.outlet_id, t.outlet_id)::text
        when t.kind = 'room' then 'room_service'
        else 'other'
      end as key,
      count(*)::int as orders,
      coalesce(sum(o.total_cents), 0)::bigint as cents,
      count(distinct o.table_session_id)::int as guests
    from orders o
    left join dining_tables t on t.id = o.table_id
    where o.restaurant_id = ${rid} and o.status <> 'cancelled'
      and o.created_at >= ${start} and o.created_at < ${end}
    group by 1`);
  const list = await db
    .select({ id: outlets.id, name: outlets.name, kind: outlets.kind })
    .from(outlets)
    .where(eq(outlets.restaurantId, rid))
    .orderBy(asc(outlets.sortOrder), asc(outlets.createdAt));
  const by = new Map(rows.rows.map((r) => [r.key, r]));
  const line = (key: string, name: string | null, kind: string) => {
    const r = by.get(key);
    const cents = Number(r?.cents ?? 0);
    const orders = Number(r?.orders ?? 0);
    return { key, name, kind, orders, cents, averageCents: orders ? Math.round(cents / orders) : 0 };
  };
  const lines = [
    ...list.map((o) => line(o.id, o.name, o.kind)),
    line("room_service", null, "room_service"),
    line("other", null, "other"),
  ].filter((l) => l.orders > 0 || list.some((o) => o.id === l.key));
  const totalCents = lines.reduce((s, l) => s + l.cents, 0);
  return {
    lines: lines.map((l) => ({ ...l, share: totalCents ? l.cents / totalCents : 0 })),
    totalCents,
    orders: lines.reduce((s, l) => s + l.orders, 0),
  };
}
