import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/server/db/client";
import { diningTables, restaurants, tableSessions } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { isUniqueViolation } from "@/server/db/errors";
import { assertTableQuota, lockRestaurant } from "@/server/entitlements";
import { AppError, conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid, randomToken } from "@/lib/ids";
import { bulkTablesSchema, tableSchema, type BulkTablesInput, type TableInput } from "./schemas";

const notDeleted = (rid: string) => and(eq(diningTables.restaurantId, rid), isNull(diningTables.deletedAt));

export async function listTables(db: Database, ctx: RestaurantContext) {
  assertCan(ctx, "tables.view");
  return db
    .select({
      id: diningTables.id,
      label: diningTables.label,
      kind: diningTables.kind,
      number: diningTables.number,
      capacity: diningTables.capacity,
      zone: diningTables.zone,
      qrToken: diningTables.qrToken,
      qrEnabled: diningTables.qrEnabled,
      qrRegeneratedAt: diningTables.qrRegeneratedAt,
      sortOrder: diningTables.sortOrder,
      openSessionId: tableSessions.id,
      openSessionSince: tableSessions.openedAt,
    })
    .from(diningTables)
    .leftJoin(
      tableSessions,
      and(eq(tableSessions.tableId, diningTables.id), eq(tableSessions.status, "open")),
    )
    .where(notDeleted(ctx.restaurant.id))
    .orderBy(asc(diningTables.sortOrder), asc(diningTables.number), asc(diningTables.label));
}

export async function getTablesByIds(db: Database, ctx: RestaurantContext, ids: string[]) {
  assertCan(ctx, "tables.view");
  const valid = ids.filter(isUuid);
  if (valid.length === 0) return [];
  return db
    .select()
    .from(diningTables)
    .where(and(notDeleted(ctx.restaurant.id), inArray(diningTables.id, valid)))
    .orderBy(asc(diningTables.sortOrder), asc(diningTables.number), asc(diningTables.label));
}

async function nextSortOrder(tx: DbOrTx, rid: string) {
  const [r] = await tx
    .select({ max: sql<number>`coalesce(max(${diningTables.sortOrder}), -1)`.mapWith(Number) })
    .from(diningTables)
    .where(notDeleted(rid));
  return (r?.max ?? -1) + 1;
}

function labelConflict(e: unknown): never {
  if (isUniqueViolation(e, "dining_tables_restaurant_label_uq")) {
    throw new AppError("CONFLICT", "label_taken", { field: "label" });
  }
  throw e;
}

export async function createTable(db: Database, ctx: RestaurantContext, raw: TableInput) {
  assertCan(ctx, "tables.manage");
  const input = tableSchema.parse(raw);
  const numeric = /^\d+$/.test(input.label) ? Number(input.label) : null;
  try {
    return await db.transaction(async (tx) => {
      await lockRestaurant(tx, ctx.restaurant.id);
      await assertTableQuota(tx, ctx.restaurant.id, 1);
      const [table] = await tx
        .insert(diningTables)
        .values({
          ...input,
          number: input.number ?? numeric,
          restaurantId: ctx.restaurant.id,
          qrToken: randomToken(),
          sortOrder: await nextSortOrder(tx, ctx.restaurant.id),
        })
        .returning();
      await recordAudit(tx, {
        action: "table.created",
        actorUserId: ctx.user.id,
        restaurantId: ctx.restaurant.id,
        entityType: "table",
        entityId: table!.id,
        metadata: { label: input.label },
      });
      return table!;
    });
  } catch (e) {
    labelConflict(e);
  }
}

/** Creates "Table from…to" in one go. Labels that already exist are skipped, not duplicated. */
export async function bulkCreateTables(db: Database, ctx: RestaurantContext, raw: BulkTablesInput) {
  assertCan(ctx, "tables.manage");
  const input = bulkTablesSchema.parse(raw);
  const wanted = Array.from({ length: input.to - input.from + 1 }, (_, i) => {
    const n = input.from + i;
    return { n, label: `${input.prefix}${n}` };
  });

  return db.transaction(async (tx) => {
    await lockRestaurant(tx, ctx.restaurant.id);
    const existing = await tx
      .select({ label: sql<string>`lower(${diningTables.label})` })
      .from(diningTables)
      .where(notDeleted(ctx.restaurant.id));
    const taken = new Set(existing.map((e) => e.label));
    const toCreate = wanted.filter((w) => !taken.has(w.label.toLowerCase()));
    if (toCreate.length === 0) return { created: 0, skipped: wanted.length };

    await assertTableQuota(tx, ctx.restaurant.id, toCreate.length);
    const start = await nextSortOrder(tx, ctx.restaurant.id);
    await tx.insert(diningTables).values(
      toCreate.map((w, i) => ({
        restaurantId: ctx.restaurant.id,
        label: w.label,
        number: w.n,
        capacity: input.capacity ?? null,
        zone: input.zone ?? null,
        kind: input.kind,
        qrToken: randomToken(),
        sortOrder: start + i,
      })),
    );
    await recordAudit(tx, {
      action: "table.bulk_created",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      metadata: { from: input.from, to: input.to, prefix: input.prefix, created: toCreate.length },
    });
    return { created: toCreate.length, skipped: wanted.length - toCreate.length };
  });
}

async function loadTable(tx: DbOrTx, ctx: RestaurantContext, tableId: string) {
  if (!isUuid(tableId)) throw notFound();
  const [t] = await tx
    .select()
    .from(diningTables)
    .where(and(eq(diningTables.id, tableId), notDeleted(ctx.restaurant.id)));
  if (!t) throw notFound();
  return t;
}

export async function updateTable(db: Database, ctx: RestaurantContext, tableId: string, raw: TableInput) {
  assertCan(ctx, "tables.manage");
  const input = tableSchema.parse(raw);
  try {
    return await db.transaction(async (tx) => {
      const before = await loadTable(tx, ctx, tableId);
      // The kind only changes when the form sends it (older callers keep a room a room).
      const values = raw.kind ? input : { ...input, kind: undefined };
      const [t] = await tx.update(diningTables).set(values).where(eq(diningTables.id, tableId)).returning();
      await recordAudit(tx, {
        action: "table.updated",
        actorUserId: ctx.user.id,
        restaurantId: ctx.restaurant.id,
        entityType: "table",
        entityId: tableId,
        metadata: { from: before.label, to: input.label },
      });
      return t!;
    });
  } catch (e) {
    labelConflict(e);
  }
}

export async function setQrEnabled(db: Database, ctx: RestaurantContext, tableId: string, enabled: boolean) {
  assertCan(ctx, "tables.manage");
  return db.transaction(async (tx) => {
    await loadTable(tx, ctx, tableId);
    const [t] = await tx
      .update(diningTables)
      .set({ qrEnabled: enabled })
      .where(eq(diningTables.id, tableId))
      .returning();
    await recordAudit(tx, {
      action: enabled ? "table.qr_enabled" : "table.qr_disabled",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "table",
      entityId: tableId,
    });
    return t!;
  });
}

/** Issues a new token: every printed copy of the old QR code stops working immediately. */
export async function regenerateQr(db: Database, ctx: RestaurantContext, tableId: string) {
  assertCan(ctx, "tables.manage");
  return db.transaction(async (tx) => {
    await loadTable(tx, ctx, tableId);
    const [t] = await tx
      .update(diningTables)
      .set({ qrToken: randomToken(), qrRegeneratedAt: new Date() })
      .where(eq(diningTables.id, tableId))
      .returning();
    await recordAudit(tx, {
      action: "table.qr_regenerated",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "table",
      entityId: tableId,
    });
    return t!;
  });
}

export async function deleteTable(db: Database, ctx: RestaurantContext, tableId: string) {
  assertCan(ctx, "tables.manage");
  await db.transaction(async (tx) => {
    await loadTable(tx, ctx, tableId);
    const [open] = await tx
      .select({ n: count() })
      .from(tableSessions)
      .where(and(eq(tableSessions.tableId, tableId), eq(tableSessions.status, "open")));
    if ((open?.n ?? 0) > 0) throw conflict("table_has_open_session");
    // Soft delete keeps order history intact; the QR is disabled so old prints stop working.
    await tx
      .update(diningTables)
      .set({ deletedAt: new Date(), qrEnabled: false })
      .where(eq(diningTables.id, tableId));
    await recordAudit(tx, {
      action: "table.deleted",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "table",
      entityId: tableId,
    });
  });
}

/**
 * Public resolution of a scanned QR token (no authentication).
 * Returns null for unknown, disabled or deleted tables and for suspended restaurants.
 */
export async function resolveQrToken(db: DbOrTx, token: string) {
  if (!/^[0-9A-Za-z]{16,32}$/.test(token)) return null;
  const [row] = await db
    .select({
      table: { id: diningTables.id, label: diningTables.label, qrEnabled: diningTables.qrEnabled },
      restaurant: {
        id: restaurants.id,
        name: restaurants.name,
        slug: restaurants.slug,
        logoKey: restaurants.logoKey,
        status: restaurants.status,
        currency: restaurants.currency,
        defaultLocale: restaurants.defaultLocale,
      },
    })
    .from(diningTables)
    .innerJoin(restaurants, eq(restaurants.id, diningTables.restaurantId))
    .where(
      and(eq(diningTables.qrToken, token), isNull(diningTables.deletedAt), isNull(restaurants.deletedAt)),
    )
    .limit(1);
  if (!row || !row.table.qrEnabled || row.restaurant.status !== "active") return null;
  return row;
}
