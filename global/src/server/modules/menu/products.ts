import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/server/db/client";
import { productOptionGroups, products, taxRates } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { AppError, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { applyOrder, assertSameSet, loadCategory } from "./categories";
import { listProductImages, productImageUrls } from "./images";
import { assertOwnedGroups } from "./options";
import { productSchema, reorderSchema, type ProductInput } from "./schemas";

const live = (rid: string) => and(eq(products.restaurantId, rid), isNull(products.deletedAt));

export async function listProducts(db: Database, ctx: RestaurantContext, categoryId?: string) {
  assertCan(ctx, "menu.view");
  const filters = [live(ctx.restaurant.id)];
  if (categoryId) {
    if (!isUuid(categoryId)) return [];
    filters.push(eq(products.categoryId, categoryId));
  }
  const rows = await db
    .select({
      id: products.id,
      categoryId: products.categoryId,
      name: products.name,
      priceCents: products.priceCents,
      compareAtPriceCents: products.compareAtPriceCents,
      isAvailable: products.isAvailable,
      isActive: products.isActive,
      isFeatured: products.isFeatured,
      sortOrder: products.sortOrder,
      tags: products.tags,
      imageKey: sql<
        string | null
      >`(select pi.storage_key from product_images pi where pi.product_id = "products"."id" order by pi.sort_order limit 1)`,
      optionGroupCount:
        sql<number>`(select count(*) from product_option_groups pog where pog.product_id = "products"."id")`.mapWith(
          Number,
        ),
    })
    .from(products)
    .where(and(...filters))
    .orderBy(asc(products.sortOrder), asc(products.createdAt));
  return rows.map((r) => ({ ...r, image: r.imageKey ? productImageUrls(r.imageKey) : null }));
}

async function loadProduct(tx: DbOrTx, ctx: RestaurantContext, id: string) {
  if (!isUuid(id)) throw notFound();
  const [p] = await tx
    .select()
    .from(products)
    .where(and(eq(products.id, id), live(ctx.restaurant.id)));
  if (!p) throw notFound();
  return p;
}

export async function getProduct(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "menu.view");
  const p = await loadProduct(db, ctx, id);
  const [groups, images] = await Promise.all([
    db
      .select({ groupId: productOptionGroups.groupId })
      .from(productOptionGroups)
      .where(eq(productOptionGroups.productId, id))
      .orderBy(asc(productOptionGroups.sortOrder)),
    listProductImages(db, id),
  ]);
  return { ...p, optionGroupIds: groups.map((g) => g.groupId), images };
}

/** Resolves the tax rate: an explicit, owned rate, or the restaurant's default one. */
async function resolveTaxRate(tx: DbOrTx, ctx: RestaurantContext, taxRateId: string | null | undefined) {
  if (taxRateId) {
    const [r] = await tx
      .select({ id: taxRates.id })
      .from(taxRates)
      .where(
        and(
          eq(taxRates.id, taxRateId),
          eq(taxRates.restaurantId, ctx.restaurant.id),
          isNull(taxRates.deletedAt),
        ),
      );
    if (!r) throw new AppError("VALIDATION", "invalid_tax_rate", { field: "taxRateId" });
    return r.id;
  }
  const [d] = await tx
    .select({ id: taxRates.id })
    .from(taxRates)
    .where(
      and(
        eq(taxRates.restaurantId, ctx.restaurant.id),
        eq(taxRates.isDefault, true),
        isNull(taxRates.deletedAt),
      ),
    );
  return d?.id ?? null;
}

async function setProductGroups(tx: DbOrTx, ctx: RestaurantContext, productId: string, groupIds: string[]) {
  const unique = [...new Set(groupIds)];
  await assertOwnedGroups(tx, ctx, unique);
  await tx.delete(productOptionGroups).where(eq(productOptionGroups.productId, productId));
  if (unique.length) {
    await tx
      .insert(productOptionGroups)
      .values(
        unique.map((groupId, i) => ({ restaurantId: ctx.restaurant.id, productId, groupId, sortOrder: i })),
      );
  }
}

export async function createProduct(db: Database, ctx: RestaurantContext, raw: ProductInput) {
  assertCan(ctx, "menu.manage");
  const { optionGroupIds, ...input } = productSchema.parse(raw);
  return db.transaction(async (tx) => {
    await loadCategory(tx, ctx, input.categoryId).catch(() => {
      throw new AppError("VALIDATION", "invalid_category", { field: "categoryId" });
    });
    const taxRateId = await resolveTaxRate(tx, ctx, input.taxRateId);
    const [max] = await tx
      .select({ v: sql<number>`coalesce(max(${products.sortOrder}), -1)`.mapWith(Number) })
      .from(products)
      .where(and(live(ctx.restaurant.id), eq(products.categoryId, input.categoryId)));
    const [p] = await tx
      .insert(products)
      .values({ ...input, taxRateId, restaurantId: ctx.restaurant.id, sortOrder: (max?.v ?? -1) + 1 })
      .returning();
    await setProductGroups(tx, ctx, p!.id, optionGroupIds);
    await recordAudit(tx, {
      action: "product.created",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "product",
      entityId: p!.id,
      metadata: { name: input.name, priceCents: input.priceCents },
    });
    return p!;
  });
}

export async function updateProduct(db: Database, ctx: RestaurantContext, id: string, raw: ProductInput) {
  assertCan(ctx, "menu.manage");
  const { optionGroupIds, ...input } = productSchema.parse(raw);
  return db.transaction(async (tx) => {
    const before = await loadProduct(tx, ctx, id);
    await loadCategory(tx, ctx, input.categoryId).catch(() => {
      throw new AppError("VALIDATION", "invalid_category", { field: "categoryId" });
    });
    const taxRateId = await resolveTaxRate(tx, ctx, input.taxRateId);
    let sortOrder = before.sortOrder;
    if (before.categoryId !== input.categoryId) {
      const [max] = await tx
        .select({ v: sql<number>`coalesce(max(${products.sortOrder}), -1)`.mapWith(Number) })
        .from(products)
        .where(and(live(ctx.restaurant.id), eq(products.categoryId, input.categoryId)));
      sortOrder = (max?.v ?? -1) + 1;
    }
    const [p] = await tx
      .update(products)
      .set({ ...input, taxRateId, sortOrder })
      .where(eq(products.id, id))
      .returning();
    await setProductGroups(tx, ctx, id, optionGroupIds);
    await recordAudit(tx, {
      action: "product.updated",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "product",
      entityId: id,
      // Price changes matter for disputes: keep before/after.
      metadata:
        before.priceCents !== input.priceCents
          ? { priceCents: { from: before.priceCents, to: input.priceCents } }
          : {},
    });
    return p!;
  });
}

/** Quick toggles from the menu list (sold out / hidden). */
export async function setProductFlags(
  db: Database,
  ctx: RestaurantContext,
  id: string,
  flags: { isAvailable?: boolean; isActive?: boolean },
) {
  // Hiding a dish is menu management; marking it sold out is also a service action
  // (floor staff can flag "épuisé" during the rush).
  if (flags.isActive !== undefined) assertCan(ctx, "menu.manage");
  if (flags.isAvailable !== undefined && !ctx.permissions.has("menu.manage"))
    assertCan(ctx, "orders.update_status");
  return db.transaction(async (tx) => {
    await loadProduct(tx, ctx, id);
    const [p] = await tx.update(products).set(flags).where(eq(products.id, id)).returning();
    await recordAudit(tx, {
      action: "product.flags_updated",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "product",
      entityId: id,
      metadata: flags,
    });
    return p!;
  });
}

export async function deleteProduct(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "menu.manage");
  await db.transaction(async (tx) => {
    await loadProduct(tx, ctx, id);
    // Soft delete: past orders keep their snapshot; the product disappears from the menu.
    await tx.update(products).set({ deletedAt: new Date(), isActive: false }).where(eq(products.id, id));
    await recordAudit(tx, {
      action: "product.deleted",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "product",
      entityId: id,
    });
  });
}

export async function reorderProducts(
  db: Database,
  ctx: RestaurantContext,
  categoryId: string,
  rawIds: string[],
) {
  assertCan(ctx, "menu.manage");
  const ids = reorderSchema.parse(rawIds);
  await db.transaction(async (tx) => {
    await loadCategory(tx, ctx, categoryId);
    const existing = await tx
      .select({ id: products.id })
      .from(products)
      .where(and(live(ctx.restaurant.id), eq(products.categoryId, categoryId)));
    assertSameSet(
      existing.map((e) => e.id),
      ids,
    );
    await applyOrder(tx, "products", ids);
  });
}
