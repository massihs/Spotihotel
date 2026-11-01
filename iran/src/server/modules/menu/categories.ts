import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/server/db/client";
import { categories, products } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { AppError, conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { DEFAULT_CATEGORY_TEMPLATES } from "@/server/modules/catalog/defaults";
import { categorySchema, reorderSchema, type CategoryInput } from "./schemas";

const live = (rid: string) => and(eq(categories.restaurantId, rid), isNull(categories.deletedAt));

export async function listCategories(db: Database, ctx: RestaurantContext) {
  assertCan(ctx, "menu.view");
  return db
    .select({
      id: categories.id,
      name: categories.name,
      description: categories.description,
      icon: categories.icon,
      templateKey: categories.templateKey,
      isActive: categories.isActive,
      sortOrder: categories.sortOrder,
      productCount:
        sql<number>`(select count(*) from products p where p.category_id = "categories"."id" and p.deleted_at is null)`.mapWith(
          Number,
        ),
    })
    .from(categories)
    .where(live(ctx.restaurant.id))
    .orderBy(asc(categories.sortOrder), asc(categories.createdAt));
}

export async function loadCategory(tx: DbOrTx, ctx: RestaurantContext, id: string) {
  if (!isUuid(id)) throw notFound();
  const [c] = await tx
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), live(ctx.restaurant.id)));
  if (!c) throw notFound();
  return c;
}

async function nextSort(tx: DbOrTx, rid: string) {
  const [r] = await tx
    .select({ max: sql<number>`coalesce(max(${categories.sortOrder}), -1)`.mapWith(Number) })
    .from(categories)
    .where(live(rid));
  return (r?.max ?? -1) + 1;
}

export async function createCategory(db: Database, ctx: RestaurantContext, raw: CategoryInput) {
  assertCan(ctx, "menu.manage");
  const input = categorySchema.parse(raw);
  return db.transaction(async (tx) => {
    const [c] = await tx
      .insert(categories)
      .values({ ...input, restaurantId: ctx.restaurant.id, sortOrder: await nextSort(tx, ctx.restaurant.id) })
      .returning();
    await recordAudit(tx, {
      action: "category.created",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "category",
      entityId: c!.id,
      metadata: { name: input.name },
    });
    return c!;
  });
}

/**
 * Adds predefined categories (names are already translated by the caller, in the
 * restaurant's language). Templates already used are skipped.
 */
export async function addTemplateCategories(
  db: Database,
  ctx: RestaurantContext,
  templates: { key: string; name: string }[],
) {
  assertCan(ctx, "menu.manage");
  const valid = templates.filter((t) => (DEFAULT_CATEGORY_TEMPLATES as readonly string[]).includes(t.key));
  if (valid.length === 0) throw new AppError("VALIDATION", "templates_required");
  return db.transaction(async (tx) => {
    const used = await tx
      .select({ key: categories.templateKey })
      .from(categories)
      .where(
        and(
          live(ctx.restaurant.id),
          inArray(
            categories.templateKey,
            valid.map((t) => t.key),
          ),
        ),
      );
    const usedKeys = new Set(used.map((u) => u.key));
    const fresh = valid.filter((t) => !usedKeys.has(t.key));
    if (fresh.length === 0) return { created: 0 };
    const start = await nextSort(tx, ctx.restaurant.id);
    await tx.insert(categories).values(
      fresh.map((t, i) => ({
        restaurantId: ctx.restaurant.id,
        name: t.name.trim().slice(0, 80),
        templateKey: t.key,
        sortOrder: start + i,
      })),
    );
    await recordAudit(tx, {
      action: "category.templates_added",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      metadata: { keys: fresh.map((t) => t.key) },
    });
    return { created: fresh.length };
  });
}

export async function updateCategory(db: Database, ctx: RestaurantContext, id: string, raw: CategoryInput) {
  assertCan(ctx, "menu.manage");
  const input = categorySchema.parse(raw);
  return db.transaction(async (tx) => {
    await loadCategory(tx, ctx, id);
    const [c] = await tx.update(categories).set(input).where(eq(categories.id, id)).returning();
    await recordAudit(tx, {
      action: "category.updated",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "category",
      entityId: id,
    });
    return c!;
  });
}

/** Refuses to delete a category that still holds products (move or delete them first). */
export async function deleteCategory(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "menu.manage");
  await db.transaction(async (tx) => {
    await loadCategory(tx, ctx, id);
    const [p] = await tx
      .select({ n: count() })
      .from(products)
      .where(and(eq(products.categoryId, id), isNull(products.deletedAt)));
    if ((p?.n ?? 0) > 0) throw conflict("category_not_empty");
    await tx.update(categories).set({ deletedAt: new Date() }).where(eq(categories.id, id));
    await recordAudit(tx, {
      action: "category.deleted",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "category",
      entityId: id,
    });
  });
}

/**
 * Persists a full ordering. The list must contain exactly the restaurant's categories:
 * a stale UI (another manager added/removed one meanwhile) gets a conflict instead of a partial order.
 */
export async function reorderCategories(db: Database, ctx: RestaurantContext, rawIds: string[]) {
  assertCan(ctx, "menu.manage");
  const ids = reorderSchema.parse(rawIds);
  await db.transaction(async (tx) => {
    const existing = await tx.select({ id: categories.id }).from(categories).where(live(ctx.restaurant.id));
    assertSameSet(
      existing.map((e) => e.id),
      ids,
    );
    await applyOrder(tx, "categories", ids);
  });
}

export function assertSameSet(existing: string[], next: string[]) {
  const a = new Set(existing);
  if (new Set(next).size !== next.length || a.size !== next.length || next.some((id) => !a.has(id))) {
    throw conflict("reorder_mismatch");
  }
}

/** One UPDATE … FROM (VALUES …) instead of N queries. Ids are validated UUIDs. */
export async function applyOrder(tx: DbOrTx, table: "categories" | "products", ids: string[]) {
  const values = sql.join(
    ids.map((id, i) => sql`(${id}::uuid, ${i}::int)`),
    sql`, `,
  );
  await tx.execute(
    sql`UPDATE ${sql.identifier(table)} AS t SET sort_order = v.pos, updated_at = now() FROM (VALUES ${values}) AS v(id, pos) WHERE t.id = v.id`,
  );
}
