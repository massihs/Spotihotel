import { and, asc, eq, gte, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  categories,
  optionGroups,
  optionValues,
  orders,
  productImages,
  productOptionGroups,
  products,
  restaurantSettings,
  restaurants,
  stockItems,
  tableSessions,
  taxRates,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { forbidden, notFound } from "@/server/errors";
import { assertCan, listUserRestaurants, type RestaurantContext } from "@/server/tenancy";
import { dayStart, localDay } from "@/lib/period";
import { createRestaurant } from "@/server/modules/restaurants/service";

const ACTIVE = ["received", "accepted", "preparing", "ready"] as const;
const DAY = 86_400_000;

/**
 * The branches of the current restaurant's organization that the user manages (owner/admin),
 * with today's and the last 7 days' figures, each in its own time zone.
 */
export async function groupOverview(db: DbOrTx, ctx: RestaurantContext) {
  const mine = await listUserRestaurants(db, ctx.user.id);
  const branches = mine.filter(
    (r) => r.organizationId === ctx.restaurant.organizationId && (r.role === "owner" || r.role === "admin"),
  );
  if (!branches.some((b) => b.id === ctx.restaurant.id))
    branches.unshift({ ...ctx.restaurant, role: ctx.role } as (typeof mine)[number]);

  return Promise.all(
    branches.map(async (b) => {
      const today = dayStart(localDay(new Date(), b.timezone), b.timezone);
      const week = new Date(today.getTime() - 6 * DAY);
      const sales = and(
        eq(orders.restaurantId, b.id),
        gte(orders.placedAt, week),
        notInArray(orders.status, ["cancelled", "pending_payment"]),
      );
      const [[o], [live], [sessions], [low]] = await Promise.all([
        db
          .select({
            todayOrders: sql<number>`count(*) filter (where ${orders.placedAt} >= ${today})`.mapWith(Number),
            todayCents:
              sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.placedAt} >= ${today}), 0)`.mapWith(
                Number,
              ),
            weekCents: sql<number>`coalesce(sum(${orders.totalCents}), 0)`.mapWith(Number),
          })
          .from(orders)
          .where(sales),
        db
          .select({ n: sql<number>`count(*)`.mapWith(Number) })
          .from(orders)
          .where(and(eq(orders.restaurantId, b.id), inArray(orders.status, [...ACTIVE]))),
        db
          .select({ n: sql<number>`count(*)`.mapWith(Number) })
          .from(tableSessions)
          .where(and(eq(tableSessions.restaurantId, b.id), eq(tableSessions.status, "open"))),
        db
          .select({ n: sql<number>`count(*)`.mapWith(Number) })
          .from(stockItems)
          .where(
            and(
              eq(stockItems.restaurantId, b.id),
              isNull(stockItems.deletedAt),
              sql`${stockItems.lowStockThreshold} > 0 and ${stockItems.quantity} <= ${stockItems.lowStockThreshold}`,
            ),
          ),
      ]);
      return {
        id: b.id,
        name: b.name,
        kind: b.kind,
        status: b.status,
        currency: b.currency,
        logoKey: b.logoKey,
        role: b.role,
        isCurrent: b.id === ctx.restaurant.id,
        todayOrders: o?.todayOrders ?? 0,
        todayCents: o?.todayCents ?? 0,
        weekCents: o?.weekCents ?? 0,
        activeOrders: live?.n ?? 0,
        openTables: sessions?.n ?? 0,
        lowStock: low?.n ?? 0,
      };
    }),
  );
}
export type BranchStats = Awaited<ReturnType<typeof groupOverview>>[number];

// ─── Menu copy ───────────────────────────────────────────────────────────────

/**
 * Copies the live menu (categories, dishes, photos, option groups, VAT rates) of one
 * restaurant into another. Photos share their stored files. "replace" archives the
 * target's current menu first (soft delete: order history keeps its references).
 */
export async function copyMenuTx(tx: DbOrTx, fromId: string, toId: string, mode: "append" | "replace") {
  const now = new Date();
  if (mode === "replace") {
    for (const t of [products, categories, optionGroups] as const)
      await tx
        .update(t)
        .set({ deletedAt: now })
        .where(and(eq(t.restaurantId, toId), isNull(t.deletedAt)));
  }

  // VAT rates: matched by rate, created when missing.
  const [srcTax, dstTax] = await Promise.all([
    tx
      .select()
      .from(taxRates)
      .where(and(eq(taxRates.restaurantId, fromId), isNull(taxRates.deletedAt))),
    tx
      .select()
      .from(taxRates)
      .where(and(eq(taxRates.restaurantId, toId), isNull(taxRates.deletedAt))),
  ]);
  const taxMap = new Map<string, string>();
  for (const r of srcTax) {
    let hit = dstTax.find((d) => d.rateBps === r.rateBps);
    if (!hit) {
      [hit] = await tx
        .insert(taxRates)
        .values({ restaurantId: toId, name: r.name, rateBps: r.rateBps, isDefault: false })
        .returning();
      dstTax.push(hit!);
    }
    taxMap.set(r.id, hit!.id);
  }

  const groupMap = new Map<string, string>();
  const groups = await tx
    .select()
    .from(optionGroups)
    .where(and(eq(optionGroups.restaurantId, fromId), isNull(optionGroups.deletedAt)));
  for (const { id, restaurantId: _r, createdAt: _c, updatedAt: _u, ...g } of groups) {
    const [n] = await tx
      .insert(optionGroups)
      .values({ ...g, restaurantId: toId })
      .returning({ id: optionGroups.id });
    groupMap.set(id, n!.id);
  }
  if (groups.length) {
    const values = await tx
      .select()
      .from(optionValues)
      .where(and(inArray(optionValues.groupId, [...groupMap.keys()]), isNull(optionValues.deletedAt)));
    if (values.length)
      await tx.insert(optionValues).values(
        values.map(({ id: _i, restaurantId: _r, createdAt: _c, updatedAt: _u, ...v }) => ({
          ...v,
          restaurantId: toId,
          groupId: groupMap.get(v.groupId)!,
        })),
      );
  }

  const [{ max } = { max: 0 }] = await tx
    .select({ max: sql<number>`coalesce(max(${categories.sortOrder}), -1) + 1`.mapWith(Number) })
    .from(categories)
    .where(and(eq(categories.restaurantId, toId), isNull(categories.deletedAt)));
  const catMap = new Map<string, string>();
  const cats = await tx
    .select()
    .from(categories)
    .where(and(eq(categories.restaurantId, fromId), isNull(categories.deletedAt)))
    .orderBy(asc(categories.sortOrder));
  for (const { id, restaurantId: _r, createdAt: _c, updatedAt: _u, ...c } of cats) {
    const [n] = await tx
      .insert(categories)
      .values({ ...c, restaurantId: toId, sortOrder: c.sortOrder + max })
      .returning({ id: categories.id });
    catMap.set(id, n!.id);
  }

  const prodMap = new Map<string, string>();
  const prods = cats.length
    ? await tx
        .select()
        .from(products)
        .where(and(inArray(products.categoryId, [...catMap.keys()]), isNull(products.deletedAt)))
    : [];
  for (const { id, restaurantId: _r, createdAt: _c, updatedAt: _u, ...p } of prods) {
    const [n] = await tx
      .insert(products)
      .values({
        ...p,
        restaurantId: toId,
        categoryId: catMap.get(p.categoryId)!,
        taxRateId: p.taxRateId ? (taxMap.get(p.taxRateId) ?? null) : null,
      })
      .returning({ id: products.id });
    prodMap.set(id, n!.id);
  }
  if (prods.length) {
    const ids = [...prodMap.keys()];
    const images = await tx.select().from(productImages).where(inArray(productImages.productId, ids));
    if (images.length)
      await tx.insert(productImages).values(
        images.map(({ id: _i, restaurantId: _r, createdAt: _c, ...img }) => ({
          ...img,
          restaurantId: toId,
          productId: prodMap.get(img.productId)!,
        })),
      );
    const links = await tx
      .select()
      .from(productOptionGroups)
      .where(inArray(productOptionGroups.productId, ids));
    const mapped = links
      .filter((l) => groupMap.has(l.groupId))
      .map((l) => ({
        restaurantId: toId,
        productId: prodMap.get(l.productId)!,
        groupId: groupMap.get(l.groupId)!,
        sortOrder: l.sortOrder,
      }));
    if (mapped.length) await tx.insert(productOptionGroups).values(mapped);
  }
  return { categories: cats.length, products: prods.length, optionGroups: groups.length };
}

export const copyMenuSchema = z.object({
  fromId: z.uuid(),
  mode: z.enum(["append", "replace"]).default("append"),
});

/** Imports another branch's menu into the current restaurant. */
export async function copyMenuFrom(
  db: Database,
  ctx: RestaurantContext,
  source: RestaurantContext,
  raw: z.input<typeof copyMenuSchema>,
) {
  assertCan(ctx, "menu.manage");
  assertCan(source, "menu.view");
  const input = copyMenuSchema.parse(raw);
  if (source.restaurant.id !== input.fromId || source.restaurant.id === ctx.restaurant.id) throw notFound();
  if (source.restaurant.organizationId !== ctx.restaurant.organizationId && !ctx.user.isSuperAdmin)
    throw forbidden("other_organization");
  const res = await db.transaction((tx) => copyMenuTx(tx, input.fromId, ctx.restaurant.id, input.mode));
  await recordAudit(db, {
    action: "menu.copied",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "restaurant",
    entityId: ctx.restaurant.id,
    metadata: { fromId: input.fromId, mode: input.mode, ...res },
  });
  return res;
}

// ─── New branch ──────────────────────────────────────────────────────────────

export const branchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  copyMenu: z.boolean().default(true),
  copySettings: z.boolean().default(true),
});

/**
 * Opens a new branch (شعبه) in the same organization, owned by the current owner. It can
 * start with this restaurant's menu and settings (payments, VAT mode, loyalty, languages…).
 */
export async function createBranch(db: Database, ctx: RestaurantContext, raw: z.input<typeof branchSchema>) {
  if (ctx.role !== "owner") throw forbidden("owner_only");
  const input = branchSchema.parse(raw);
  const branch = await db.transaction(async (tx) => {
    const [src] = await tx.select().from(restaurants).where(eq(restaurants.id, ctx.restaurant.id));
    if (!src) throw notFound();
    const created = await createRestaurant(tx, {
      organizationId: src.organizationId,
      ownerUserId: ctx.user.id,
      name: input.name,
      currency: src.currency,
      timezone: src.timezone,
      country: src.country,
      defaultLocale: src.defaultLocale,
      kind: src.kind,
    });
    if (input.copySettings) {
      const [s] = await tx
        .select()
        .from(restaurantSettings)
        .where(eq(restaurantSettings.restaurantId, src.id));
      if (s) {
        const { restaurantId: _r, updatedAt: _u, orderPrefix: _p, ...copy } = s;
        await tx.update(restaurantSettings).set(copy).where(eq(restaurantSettings.restaurantId, created.id));
      }
    }
    if (input.copyMenu) await copyMenuTx(tx, src.id, created.id, "append");
    return created;
  });
  await recordAudit(db, {
    action: "restaurant.branch_created",
    actorUserId: ctx.user.id,
    restaurantId: branch.id,
    entityType: "restaurant",
    entityId: branch.id,
    metadata: { fromId: ctx.restaurant.id, copyMenu: input.copyMenu, copySettings: input.copySettings },
  });
  return branch;
}
