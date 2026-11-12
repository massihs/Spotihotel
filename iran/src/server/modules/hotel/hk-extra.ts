import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { auditLogs, diningTables, folioLines, hkLogbook, roomTypes, stays, users } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { emit, topics } from "@/server/infra/realtime";
import { notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { getPmsSettings } from "@/server/modules/pms/setup";
import type { Table } from "@/server/modules/pms/desk-reports";
import { servicesSettings } from "./services";

/**
 * Housekeeping beyond the day's plan: the logbook (دفتر گزارش: notes, lost and found, incidents),
 * the bulk operations (عملیات), the rooms' cleaning report per housekeeper (گزارشات) and the
 * minibar consumption report.
 */

export const LOG_CATEGORIES = ["note", "lost_found", "incident", "request"] as const;
export const logEntrySchema = z.object({
  category: z.enum(LOG_CATEGORIES),
  roomId: z.uuid().nullish(),
  text: z.string().trim().min(1).max(2000),
});

export async function listLogbook(
  db: DbOrTx,
  ctx: RestaurantContext,
  from: string,
  to: string,
  status?: string,
) {
  assertCan(ctx, "tables.view");
  const rows = await db
    .select({
      id: hkLogbook.id,
      businessDate: hkLogbook.businessDate,
      category: hkLogbook.category,
      text: hkLogbook.text,
      status: hkLogbook.status,
      room: diningTables.label,
      by: users.fullName,
      createdAt: hkLogbook.createdAt,
      closedAt: hkLogbook.closedAt,
    })
    .from(hkLogbook)
    .leftJoin(diningTables, eq(diningTables.id, hkLogbook.roomId))
    .leftJoin(users, eq(users.id, hkLogbook.userId))
    .where(
      and(
        eq(hkLogbook.restaurantId, ctx.restaurant.id),
        gte(hkLogbook.businessDate, from),
        lte(hkLogbook.businessDate, to),
        status ? eq(hkLogbook.status, status) : undefined,
      ),
    )
    .orderBy(desc(hkLogbook.createdAt))
    .limit(500);
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    closedAt: r.closedAt?.toISOString() ?? null,
  }));
}

export async function addLogEntry(db: Database, ctx: RestaurantContext, raw: z.input<typeof logEntrySchema>) {
  assertCan(ctx, "orders.update_status");
  const v = logEntrySchema.parse(raw);
  const { businessDate } = await getPmsSettings(db, ctx.restaurant.id, ctx.restaurant.timezone);
  if (v.roomId) {
    const [r] = await db
      .select({ id: diningTables.id })
      .from(diningTables)
      .where(and(eq(diningTables.id, v.roomId), eq(diningTables.restaurantId, ctx.restaurant.id)));
    if (!r) throw notFound();
  }
  const [row] = await db
    .insert(hkLogbook)
    .values({
      restaurantId: ctx.restaurant.id,
      businessDate,
      roomId: v.roomId ?? null,
      category: v.category,
      text: v.text,
      status: v.category === "note" ? "closed" : "open",
      userId: ctx.user.id,
    })
    .returning();
  return row!;
}

export async function closeLogEntry(db: Database, ctx: RestaurantContext, id: string, open = false) {
  assertCan(ctx, "orders.update_status");
  const [row] = await db
    .update(hkLogbook)
    .set({ status: open ? "open" : "closed", closedAt: open ? null : new Date() })
    .where(and(eq(hkLogbook.id, id), eq(hkLogbook.restaurantId, ctx.restaurant.id)))
    .returning({ id: hkLogbook.id });
  if (!row) throw notFound();
}

export const HK_OPERATIONS = [
  "occupiedDirty",
  "cleanInspected",
  "vacantDirtyClean",
  "clearAssignments",
] as const;
export type HkOperation = (typeof HK_OPERATIONS)[number];

/** عملیات: one change applied to many rooms at once; returns how many rooms changed. */
export async function runHkOperation(db: Database, ctx: RestaurantContext, raw: string) {
  assertCan(ctx, "tables.manage");
  const op = z.enum(HK_OPERATIONS).parse(raw);
  const rid = ctx.restaurant.id;
  const occupied = sql`exists (select 1 from ${stays} s where s.room_id = ${diningTables.id} and s.status = 'in_house')`;
  const base = and(eq(diningTables.restaurantId, rid), eq(diningTables.kind, "room"));
  const now = new Date();
  const rows =
    op === "occupiedDirty"
      ? await db
          .update(diningTables)
          .set({ housekeeping: "dirty", housekeepingAt: now })
          .where(and(base, inArray(diningTables.housekeeping, ["clean", "inspected"]), occupied))
          .returning({ id: diningTables.id })
      : op === "cleanInspected"
        ? await db
            .update(diningTables)
            .set({ housekeeping: "inspected", housekeepingAt: now })
            .where(and(base, eq(diningTables.housekeeping, "clean")))
            .returning({ id: diningTables.id })
        : op === "vacantDirtyClean"
          ? await db
              .update(diningTables)
              .set({ housekeeping: "clean", housekeepingAt: now })
              .where(and(base, eq(diningTables.housekeeping, "dirty"), sql`not ${occupied}`))
              .returning({ id: diningTables.id })
          : await db
              .update(diningTables)
              .set({ housekeeperUserId: null, housekeeperOn: null })
              .where(and(base, sql`${diningTables.housekeeperUserId} is not null`))
              .returning({ id: diningTables.id });
  await recordAudit(db, {
    action: "housekeeping.operation",
    actorUserId: ctx.user.id,
    restaurantId: rid,
    metadata: { op, rooms: rows.length },
  });
  await emit(db, { topic: topics.restaurant(rid), type: "notification.created" });
  return rows.length;
}

/** At the night audit: rooms slept in go back to dirty, when the hotel cleans them daily. */
export async function dirtyStayoversAfterAudit(db: Database, ctx: RestaurantContext) {
  const conf = (await servicesSettings(db, ctx.restaurant.id, ctx.restaurant.timezone)).housekeeping;
  if (!conf.dirtyStayoversDaily) return 0;
  const rows = await db
    .update(diningTables)
    .set({ housekeeping: "dirty", housekeepingAt: new Date() })
    .where(
      and(
        eq(diningTables.restaurantId, ctx.restaurant.id),
        eq(diningTables.kind, "room"),
        inArray(diningTables.housekeeping, ["clean", "inspected"]),
        sql`exists (select 1 from ${stays} s where s.room_id = ${diningTables.id} and s.status = 'in_house')`,
      ),
    )
    .returning({ id: diningTables.id });
  return rows.length;
}

/** گزارشات: rooms cleaned per housekeeper and day (from the rooms' status changes), with credits. */
export async function cleaningReport(db: DbOrTx, ctx: RestaurantContext, from: string, to: string) {
  assertCan(ctx, "tables.view");
  const tz = ctx.restaurant.timezone;
  const credits = (await servicesSettings(db, ctx.restaurant.id, tz)).housekeeping.credits;
  const rows = await db
    .select({
      at: auditLogs.createdAt,
      roomId: auditLogs.entityId,
      status: sql<string>`${auditLogs.metadata}->>'status'`,
      by: users.fullName,
      typeId: diningTables.roomTypeId,
      type: roomTypes.code,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .leftJoin(diningTables, eq(diningTables.id, auditLogs.entityId))
    .leftJoin(roomTypes, eq(roomTypes.id, diningTables.roomTypeId))
    .where(
      and(
        eq(auditLogs.restaurantId, ctx.restaurant.id),
        eq(auditLogs.action, "room.housekeeping"),
        sql`${auditLogs.metadata}->>'status' in ('clean', 'inspected')`,
        gte(sql`(${auditLogs.createdAt} at time zone ${tz})::date`, sql`${from}::date`),
        lte(sql`(${auditLogs.createdAt} at time zone ${tz})::date`, sql`${to}::date`),
      ),
    )
    .orderBy(asc(auditLogs.createdAt));
  const per = new Map<string, { user: string; cleaned: number; inspected: number; credits: number }>();
  for (const r of rows) {
    const key = r.by ?? "—";
    const e = per.get(key) ?? { user: key, cleaned: 0, inspected: 0, credits: 0 };
    if (r.status === "clean") {
      e.cleaned++;
      e.credits += (r.typeId && credits[r.typeId]) || 0;
    } else e.inspected++;
    per.set(key, e);
  }
  const list = [...per.values()].sort((a, b) => b.cleaned - a.cleaned);
  const byStaff: Table = {
    cols: [
      { key: "user", type: "text" },
      { key: "cleaned", type: "int" },
      { key: "inspected", type: "int" },
      { key: "credits", type: "int" },
    ],
    rows: list,
    totals: {
      user: "total",
      cleaned: list.reduce((s, r) => s + r.cleaned, 0),
      inspected: list.reduce((s, r) => s + r.inspected, 0),
      credits: list.reduce((s, r) => s + r.credits, 0),
    },
  };
  return byStaff;
}

/** Minibar: consumption per item over the period (from the bills), then per room. */
export async function minibarReport(db: DbOrTx, ctx: RestaurantContext, from: string, to: string) {
  assertCan(ctx, "frontdesk.view");
  const where = and(
    eq(folioLines.restaurantId, ctx.restaurant.id),
    eq(folioLines.department, "minibar"),
    sql`${folioLines.voidedAt} is null`,
    gte(folioLines.businessDate, from),
    lte(folioLines.businessDate, to),
  );
  const items = await db
    .select({
      item: folioLines.description,
      qty: sql<number>`sum(${folioLines.quantity})::int`,
      amount: sql<number>`sum(${folioLines.amountCents})::bigint`,
    })
    .from(folioLines)
    .where(where)
    .groupBy(folioLines.description)
    .orderBy(sql`sum(${folioLines.amountCents}) desc`);
  const rooms = await db
    .select({
      room: sql<string>`coalesce(${diningTables.label}, '—')`,
      qty: sql<number>`sum(${folioLines.quantity})::int`,
      amount: sql<number>`sum(${folioLines.amountCents})::bigint`,
    })
    .from(folioLines)
    .leftJoin(sql`folios f`, sql`f.id = ${folioLines.folioId}`)
    .leftJoin(stays, sql`${stays.id} = f.stay_id`)
    .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
    .where(where)
    .groupBy(diningTables.label)
    .orderBy(sql`sum(${folioLines.amountCents}) desc`);
  const num = (v: unknown) => Number(v ?? 0);
  const mk = (
    first: string,
    rows: { qty: number; amount: number }[],
    label: (r: never) => string,
  ): Table => ({
    cols: [
      { key: first, type: "text" },
      { key: "qty", type: "int" },
      { key: "amount", type: "money" },
    ],
    rows: rows.map((r) => ({ [first]: label(r as never), qty: num(r.qty), amount: num(r.amount) })),
    totals: {
      [first]: "total",
      qty: rows.reduce((s, r) => s + num(r.qty), 0),
      amount: rows.reduce((s, r) => s + num(r.amount), 0),
    },
  });
  return {
    byItem: mk("item", items, (r: { item: string }) => r.item),
    byRoom: mk("room", rooms, (r: { room: string }) => r.room),
  };
}
