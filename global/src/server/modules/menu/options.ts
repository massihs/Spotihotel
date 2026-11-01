import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/server/db/client";
import { optionGroups, optionValues, productOptionGroups } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { AppError, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { optionGroupSchema, type OptionGroupInput } from "./schemas";

const liveGroups = (rid: string) => and(eq(optionGroups.restaurantId, rid), isNull(optionGroups.deletedAt));

export async function listOptionGroups(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "menu.view");
  const groups = await db
    .select({
      id: optionGroups.id,
      name: optionGroups.name,
      description: optionGroups.description,
      minSelect: optionGroups.minSelect,
      maxSelect: optionGroups.maxSelect,
      usage:
        sql<number>`(select count(*) from product_option_groups pog join products p on p.id = pog.product_id where pog.group_id = "option_groups"."id" and p.deleted_at is null)`.mapWith(
          Number,
        ),
    })
    .from(optionGroups)
    .where(liveGroups(ctx.restaurant.id))
    .orderBy(asc(optionGroups.name));
  if (groups.length === 0) return [];
  const values = await db
    .select()
    .from(optionValues)
    .where(
      and(
        inArray(
          optionValues.groupId,
          groups.map((g) => g.id),
        ),
        isNull(optionValues.deletedAt),
      ),
    )
    .orderBy(asc(optionValues.sortOrder));
  return groups.map((g) => ({ ...g, values: values.filter((v) => v.groupId === g.id) }));
}

/** Throws unless every id is a live option group of the current restaurant. */
export async function assertOwnedGroups(tx: DbOrTx, ctx: RestaurantContext, ids: string[]) {
  if (ids.length === 0) return;
  const rows = await tx
    .select({ id: optionGroups.id })
    .from(optionGroups)
    .where(and(liveGroups(ctx.restaurant.id), inArray(optionGroups.id, ids)));
  if (rows.length !== new Set(ids).size)
    throw new AppError("VALIDATION", "invalid_option_group", { field: "optionGroupIds" });
}

export async function createOptionGroup(db: Database, ctx: RestaurantContext, raw: OptionGroupInput) {
  assertCan(ctx, "menu.manage");
  const input = optionGroupSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [group] = await tx
      .insert(optionGroups)
      .values({
        restaurantId: ctx.restaurant.id,
        name: input.name,
        description: input.description,
        minSelect: input.minSelect,
        maxSelect: input.maxSelect,
      })
      .returning();
    await tx.insert(optionValues).values(
      input.values.map((v, i) => ({
        restaurantId: ctx.restaurant.id,
        groupId: group!.id,
        name: v.name,
        priceDeltaCents: v.priceDeltaCents,
        isDefault: v.isDefault,
        isAvailable: v.isAvailable,
        sortOrder: i,
      })),
    );
    await recordAudit(tx, {
      action: "option_group.created",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "option_group",
      entityId: group!.id,
    });
    return group!;
  });
}

/**
 * Replaces the group's definition. Values keep their id when edited (so carts referencing
 * them stay valid), new ones are inserted, missing ones are soft-deleted.
 */
export async function updateOptionGroup(
  db: Database,
  ctx: RestaurantContext,
  id: string,
  raw: OptionGroupInput,
) {
  assertCan(ctx, "menu.manage");
  const input = optionGroupSchema.parse(raw);
  if (!isUuid(id)) throw notFound();
  return db.transaction(async (tx) => {
    const [group] = await tx
      .select()
      .from(optionGroups)
      .where(and(eq(optionGroups.id, id), liveGroups(ctx.restaurant.id)));
    if (!group) throw notFound();
    await tx
      .update(optionGroups)
      .set({
        name: input.name,
        description: input.description,
        minSelect: input.minSelect,
        maxSelect: input.maxSelect,
      })
      .where(eq(optionGroups.id, id));

    const existing = await tx
      .select({ id: optionValues.id })
      .from(optionValues)
      .where(and(eq(optionValues.groupId, id), isNull(optionValues.deletedAt)));
    const existingIds = new Set(existing.map((e) => e.id));
    const keep = new Set<string>();
    for (const [i, v] of input.values.entries()) {
      const fields = {
        name: v.name,
        priceDeltaCents: v.priceDeltaCents,
        isDefault: v.isDefault,
        isAvailable: v.isAvailable,
        sortOrder: i,
      };
      if (v.id) {
        if (!existingIds.has(v.id)) throw new AppError("VALIDATION", "invalid_option_value");
        keep.add(v.id);
        await tx.update(optionValues).set(fields).where(eq(optionValues.id, v.id));
      } else {
        await tx.insert(optionValues).values({ ...fields, restaurantId: ctx.restaurant.id, groupId: id });
      }
    }
    const removed = [...existingIds].filter((x) => !keep.has(x));
    if (removed.length) {
      await tx.update(optionValues).set({ deletedAt: new Date() }).where(inArray(optionValues.id, removed));
    }
    await recordAudit(tx, {
      action: "option_group.updated",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "option_group",
      entityId: id,
    });
  });
}

export async function deleteOptionGroup(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "menu.manage");
  if (!isUuid(id)) throw notFound();
  await db.transaction(async (tx) => {
    const [g] = await tx
      .update(optionGroups)
      .set({ deletedAt: new Date() })
      .where(and(eq(optionGroups.id, id), liveGroups(ctx.restaurant.id)))
      .returning({ id: optionGroups.id });
    if (!g) throw notFound();
    await tx.delete(productOptionGroups).where(eq(productOptionGroups.groupId, id));
    await recordAudit(tx, {
      action: "option_group.deleted",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "option_group",
      entityId: id,
    });
  });
}
