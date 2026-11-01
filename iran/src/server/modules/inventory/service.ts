import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { notifyTeam } from "@/server/modules/team/sections";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  orderItems,
  products,
  purchaseLines,
  purchases,
  recipeItems,
  stockItems,
  stockMovements,
  suppliers,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { MAX_AMOUNT_CENTS } from "@/lib/money";

export const STOCK_UNITS = ["g", "kg", "ml", "l", "piece", "pack"] as const;
const qty = z.coerce.number().min(0).max(1e9);
const cents = z.coerce.number().int().min(0).max(MAX_AMOUNT_CENTS);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

const liveItem = (rid: string) => and(eq(stockItems.restaurantId, rid), isNull(stockItems.deletedAt));

// ─── Stock items ─────────────────────────────────────────────────────────────

export const stockItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  unit: z.enum(STOCK_UNITS),
  lowStockThreshold: qty.default(0),
});

export async function listStock(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "inventory.view");
  const rows = await db
    .select()
    .from(stockItems)
    .where(liveItem(ctx.restaurant.id))
    .orderBy(asc(stockItems.name));
  return rows.map((r) => ({ ...r, isLow: r.quantity <= r.lowStockThreshold }));
}

export async function countLowStock(db: DbOrTx, ctx: RestaurantContext) {
  if (!ctx.permissions.has("inventory.view")) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(stockItems)
    .where(
      and(
        liveItem(ctx.restaurant.id),
        eq(stockItems.isActive, true),
        sql`${stockItems.quantity} <= ${stockItems.lowStockThreshold}`,
        sql`${stockItems.lowStockThreshold} > 0`,
      ),
    );
  return row?.n ?? 0;
}

export async function createStockItem(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof stockItemSchema> & { initialQuantity?: number; unitCostCents?: number },
) {
  assertCan(ctx, "inventory.manage");
  const input = stockItemSchema.parse(raw);
  const initial = qty.parse(raw.initialQuantity ?? 0);
  const cost = cents.parse(raw.unitCostCents ?? 0);
  return db.transaction(async (tx) => {
    const [item] = await tx
      .insert(stockItems)
      .values({ restaurantId: ctx.restaurant.id, ...input, quantity: initial, avgCostCents: cost })
      .returning();
    if (initial > 0)
      await tx.insert(stockMovements).values({
        restaurantId: ctx.restaurant.id,
        stockItemId: item!.id,
        kind: "adjustment",
        quantity: initial,
        unitCostCents: cost,
        note: "initial",
        userId: ctx.user.id,
      });
    return item!;
  });
}

export async function updateStockItem(
  db: Database,
  ctx: RestaurantContext,
  id: string,
  raw: z.input<typeof stockItemSchema>,
) {
  assertCan(ctx, "inventory.manage");
  if (!isUuid(id)) throw notFound();
  const input = stockItemSchema.parse(raw);
  const [item] = await db
    .update(stockItems)
    .set(input)
    .where(and(eq(stockItems.id, id), liveItem(ctx.restaurant.id)))
    .returning();
  if (!item) throw notFound();
  return item;
}

export async function deleteStockItem(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "inventory.manage");
  if (!isUuid(id)) throw notFound();
  await db.transaction(async (tx) => {
    await tx
      .delete(recipeItems)
      .where(and(eq(recipeItems.stockItemId, id), eq(recipeItems.restaurantId, ctx.restaurant.id)));
    await tx
      .update(stockItems)
      .set({ deletedAt: new Date() })
      .where(and(eq(stockItems.id, id), liveItem(ctx.restaurant.id)));
  });
}

export const adjustSchema = z.object({
  /** count: the new counted quantity · waste: quantity thrown away */
  kind: z.enum(["count", "waste"]),
  quantity: qty,
  note: z.string().trim().max(200).default(""),
});

/** Stock count (sets the quantity) or waste (removes some), always recorded as a movement. */
export async function adjustStock(
  db: Database,
  ctx: RestaurantContext,
  id: string,
  raw: z.input<typeof adjustSchema>,
) {
  assertCan(ctx, "inventory.manage");
  if (!isUuid(id)) throw notFound();
  const input = adjustSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(stockItems)
      .where(and(eq(stockItems.id, id), liveItem(ctx.restaurant.id)))
      .for("update");
    if (!item) throw notFound();
    const delta = round3(input.kind === "count" ? input.quantity - item.quantity : -input.quantity);
    if (delta === 0) return item;
    const [updated] = await tx
      .update(stockItems)
      .set({ quantity: round3(item.quantity + delta) })
      .where(eq(stockItems.id, id))
      .returning();
    await tx.insert(stockMovements).values({
      restaurantId: ctx.restaurant.id,
      stockItemId: id,
      kind: input.kind === "count" ? "adjustment" : "waste",
      quantity: delta,
      unitCostCents: item.avgCostCents,
      note: input.note || null,
      userId: ctx.user.id,
    });
    await notifyIfLow(tx, ctx.restaurant.id, [
      { before: item.quantity, after: updated!.quantity, item: updated! },
    ]);
    return updated!;
  });
}

// ─── Suppliers ───────────────────────────────────────────────────────────────

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .max(32)
    .transform((v) => v || null)
    .nullable()
    .optional(),
  note: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null)
    .nullable()
    .optional(),
});

export async function listSuppliers(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "inventory.view");
  return db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.restaurantId, ctx.restaurant.id), isNull(suppliers.deletedAt)))
    .orderBy(asc(suppliers.name));
}

export async function createSupplier(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof supplierSchema>,
) {
  assertCan(ctx, "inventory.manage");
  const input = supplierSchema.parse(raw);
  const [s] = await db
    .insert(suppliers)
    .values({ restaurantId: ctx.restaurant.id, ...input })
    .returning();
  return s!;
}

export async function deleteSupplier(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "inventory.manage");
  if (!isUuid(id)) throw notFound();
  await db
    .update(suppliers)
    .set({ deletedAt: new Date() })
    .where(and(eq(suppliers.id, id), eq(suppliers.restaurantId, ctx.restaurant.id)));
}

// ─── Purchases ───────────────────────────────────────────────────────────────

export const purchaseSchema = z.object({
  supplierId: z.uuid().nullable().optional(),
  reference: z.string().trim().max(64).default(""),
  note: z.string().trim().max(500).default(""),
  lines: z
    .array(z.object({ stockItemId: z.uuid(), quantity: qty.refine((v) => v > 0), unitCostCents: cents }))
    .min(1)
    .max(100),
});

/** Goods received: stock goes up and the weighted average cost is updated. */
export async function createPurchase(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof purchaseSchema>,
) {
  assertCan(ctx, "inventory.manage");
  const input = purchaseSchema.parse(raw);
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    if (input.supplierId) {
      const [s] = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.restaurantId, rid)));
      if (!s) throw notFound();
    }
    const ids = [...new Set(input.lines.map((l) => l.stockItemId))];
    const items = await tx
      .select()
      .from(stockItems)
      .where(and(liveItem(rid), inArray(stockItems.id, ids)))
      .for("update");
    if (items.length !== ids.length) throw notFound();
    const total = input.lines.reduce((s, l) => s + Math.round(l.quantity * l.unitCostCents), 0);
    const [purchase] = await tx
      .insert(purchases)
      .values({
        restaurantId: rid,
        supplierId: input.supplierId ?? null,
        reference: input.reference || null,
        note: input.note || null,
        totalCents: total,
        userId: ctx.user.id,
      })
      .returning();
    await tx.insert(purchaseLines).values(input.lines.map((l) => ({ purchaseId: purchase!.id, ...l })));
    const byId = new Map(items.map((i) => [i.id, { ...i }]));
    for (const l of input.lines) {
      const item = byId.get(l.stockItemId)!;
      const base = Math.max(0, item.quantity);
      const newQty = round3(item.quantity + l.quantity);
      const avg =
        base + l.quantity > 0
          ? Math.round((base * item.avgCostCents + l.quantity * l.unitCostCents) / (base + l.quantity))
          : l.unitCostCents;
      item.quantity = newQty;
      item.avgCostCents = avg;
      await tx
        .update(stockItems)
        .set({ quantity: newQty, avgCostCents: avg })
        .where(eq(stockItems.id, item.id));
      await tx.insert(stockMovements).values({
        restaurantId: rid,
        stockItemId: item.id,
        kind: "purchase",
        quantity: l.quantity,
        unitCostCents: l.unitCostCents,
        purchaseId: purchase!.id,
        userId: ctx.user.id,
      });
    }
    await recordAudit(tx, {
      action: "inventory.purchase_recorded",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "purchase",
      entityId: purchase!.id,
      metadata: { totalCents: total, lines: input.lines.length },
    });
    return purchase!;
  });
}

export async function listPurchases(db: DbOrTx, ctx: RestaurantContext, limit = 50) {
  assertCan(ctx, "inventory.view");
  return db
    .select({
      id: purchases.id,
      reference: purchases.reference,
      totalCents: purchases.totalCents,
      purchasedAt: purchases.purchasedAt,
      supplierName: suppliers.name,
      lineCount:
        sql<number>`(select count(*) from purchase_lines pl where pl.purchase_id = "purchases"."id")`.mapWith(
          Number,
        ),
    })
    .from(purchases)
    .leftJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .where(eq(purchases.restaurantId, ctx.restaurant.id))
    .orderBy(desc(purchases.purchasedAt))
    .limit(limit);
}

export async function listMovements(db: DbOrTx, ctx: RestaurantContext, limit = 100) {
  assertCan(ctx, "inventory.view");
  return db
    .select({
      id: stockMovements.id,
      kind: stockMovements.kind,
      quantity: stockMovements.quantity,
      note: stockMovements.note,
      createdAt: stockMovements.createdAt,
      itemName: stockItems.name,
      unit: stockItems.unit,
    })
    .from(stockMovements)
    .innerJoin(stockItems, eq(stockItems.id, stockMovements.stockItemId))
    .where(eq(stockMovements.restaurantId, ctx.restaurant.id))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);
}

// ─── Recipes ─────────────────────────────────────────────────────────────────

export const recipeSchema = z.object({
  items: z.array(z.object({ stockItemId: z.uuid(), quantity: qty.refine((v) => v > 0) })).max(50),
});

/** Every product with its recipe lines and computed portion cost. */
export async function listRecipes(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "inventory.view");
  const rid = ctx.restaurant.id;
  const [prods, lines] = await Promise.all([
    db
      .select({ id: products.id, name: products.name, priceCents: products.priceCents })
      .from(products)
      .where(and(eq(products.restaurantId, rid), isNull(products.deletedAt)))
      .orderBy(asc(products.name)),
    db
      .select({
        productId: recipeItems.productId,
        stockItemId: recipeItems.stockItemId,
        quantity: recipeItems.quantity,
        name: stockItems.name,
        unit: stockItems.unit,
        avgCostCents: stockItems.avgCostCents,
      })
      .from(recipeItems)
      .innerJoin(stockItems, eq(stockItems.id, recipeItems.stockItemId))
      .where(and(eq(recipeItems.restaurantId, rid), isNull(stockItems.deletedAt))),
  ]);
  return prods.map((p) => {
    const items = lines.filter((l) => l.productId === p.id);
    const costCents = Math.round(items.reduce((s, l) => s + l.quantity * l.avgCostCents, 0));
    return { ...p, items, costCents };
  });
}

export async function setRecipe(
  db: Database,
  ctx: RestaurantContext,
  productId: string,
  raw: z.input<typeof recipeSchema>,
) {
  assertCan(ctx, "inventory.manage");
  if (!isUuid(productId)) throw notFound();
  const input = recipeSchema.parse(raw);
  const rid = ctx.restaurant.id;
  await db.transaction(async (tx) => {
    const [p] = await tx
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.restaurantId, rid)));
    if (!p) throw notFound();
    const ids = [...new Set(input.items.map((i) => i.stockItemId))];
    if (ids.length !== input.items.length) throw conflict("duplicate_ingredient");
    if (ids.length) {
      const found = await tx
        .select({ id: stockItems.id })
        .from(stockItems)
        .where(and(liveItem(rid), inArray(stockItems.id, ids)));
      if (found.length !== ids.length) throw notFound();
    }
    await tx
      .delete(recipeItems)
      .where(and(eq(recipeItems.productId, productId), eq(recipeItems.restaurantId, rid)));
    if (input.items.length)
      await tx.insert(recipeItems).values(input.items.map((i) => ({ restaurantId: rid, productId, ...i })));
  });
}

/** Portion cost of each product (recipe × average cost), for margins and reports. */
export async function productCosts(db: DbOrTx, restaurantId: string) {
  const rows = await db
    .select({
      productId: recipeItems.productId,
      cost: sql<number>`sum(${recipeItems.quantity} * ${stockItems.avgCostCents})`.mapWith(Number),
    })
    .from(recipeItems)
    .innerJoin(stockItems, eq(stockItems.id, recipeItems.stockItemId))
    .where(eq(recipeItems.restaurantId, restaurantId))
    .groupBy(recipeItems.productId);
  return new Map(rows.map((r) => [r.productId, Math.round(r.cost)]));
}

// ─── Sales deduction ─────────────────────────────────────────────────────────

async function notifyIfLow(
  tx: DbOrTx,
  restaurantId: string,
  changes: { before: number; after: number; item: typeof stockItems.$inferSelect }[],
) {
  const crossed = changes.filter(
    (c) =>
      c.item.lowStockThreshold > 0 &&
      c.before > c.item.lowStockThreshold &&
      c.after <= c.item.lowStockThreshold,
  );
  if (!crossed.length) return;
  for (const c of crossed)
    await notifyTeam(tx, {
      restaurantId,
      type: "stock.low",
      payload: { stockItemId: c.item.id, name: c.item.name, quantity: c.after, unit: c.item.unit },
    });
}

/**
 * Applies an order to the stock using the products' recipes: sign −1 when it is sold,
 * +1 when it is cancelled. Products without a recipe are ignored. Runs inside the order's
 * transaction, so stock and sales never drift apart.
 */
export async function applyOrderToStock(tx: DbOrTx, restaurantId: string, orderId: string, sign: 1 | -1) {
  const usage = await tx
    .select({
      stockItemId: recipeItems.stockItemId,
      total: sql<number>`sum(${recipeItems.quantity} * ${orderItems.quantity})`.mapWith(Number),
    })
    .from(orderItems)
    .innerJoin(
      recipeItems,
      and(eq(recipeItems.productId, orderItems.productId), eq(recipeItems.restaurantId, restaurantId)),
    )
    .where(and(eq(orderItems.orderId, orderId), eq(orderItems.restaurantId, restaurantId)))
    .groupBy(recipeItems.stockItemId);
  if (!usage.length) return;
  const items = await tx
    .select()
    .from(stockItems)
    .where(
      and(
        liveItem(restaurantId),
        inArray(
          stockItems.id,
          usage.map((u) => u.stockItemId),
        ),
      ),
    )
    .for("update");
  const changes = [];
  for (const item of items) {
    const delta = round3(sign * (usage.find((u) => u.stockItemId === item.id)?.total ?? 0));
    if (!delta) continue;
    const [updated] = await tx
      .update(stockItems)
      .set({ quantity: round3(item.quantity + delta) })
      .where(eq(stockItems.id, item.id))
      .returning();
    await tx.insert(stockMovements).values({
      restaurantId,
      stockItemId: item.id,
      kind: sign < 0 ? "sale" : "sale_cancel",
      quantity: delta,
      unitCostCents: item.avgCostCents,
      orderId,
    });
    changes.push({ before: item.quantity, after: updated!.quantity, item: updated! });
  }
  await notifyIfLow(tx, restaurantId, changes);
}
