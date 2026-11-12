import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { auditLogs, diningTables, equipment, maintenanceTickets, users } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { addDays, isDay } from "@/server/modules/pms/calc";
import { getPmsSettings } from "@/server/modules/pms/setup";
import type { Table } from "@/server/modules/pms/desk-reports";

/**
 * Engineering (فنی و مهندسی): the equipment register (where, what, serial), preventive maintenance
 * (every N days: due list, "serviced" moves the next date) and reports on the repair tickets.
 */

export const equipmentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().max(40).optional(),
  location: z.string().trim().max(80).optional(),
  roomId: z.uuid().nullish(),
  serial: z.string().trim().max(60).optional(),
  intervalDays: z.coerce.number().int().min(1).max(3650).nullish(),
  nextServiceOn: z.string().refine(isDay).nullish(),
  note: z.string().trim().max(1000).optional(),
  active: z.coerce.boolean().default(true),
});

export async function listEquipment(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "tables.view");
  return db
    .select({
      id: equipment.id,
      name: equipment.name,
      category: equipment.category,
      location: equipment.location,
      roomId: equipment.roomId,
      room: diningTables.label,
      serial: equipment.serial,
      intervalDays: equipment.intervalDays,
      lastServiceOn: equipment.lastServiceOn,
      nextServiceOn: equipment.nextServiceOn,
      note: equipment.note,
      active: equipment.active,
    })
    .from(equipment)
    .leftJoin(diningTables, eq(diningTables.id, equipment.roomId))
    .where(and(eq(equipment.restaurantId, ctx.restaurant.id), isNull(equipment.deletedAt)))
    .orderBy(asc(equipment.category), asc(equipment.name));
}

export async function saveEquipment(
  db: Database,
  ctx: RestaurantContext,
  id: string | null,
  raw: z.input<typeof equipmentSchema>,
) {
  assertCan(ctx, "tables.manage");
  const v = equipmentSchema.parse(raw);
  const today = (await getPmsSettings(db, ctx.restaurant.id, ctx.restaurant.timezone)).businessDate;
  const values = {
    name: v.name,
    category: v.category || null,
    location: v.location || null,
    roomId: v.roomId ?? null,
    serial: v.serial || null,
    intervalDays: v.intervalDays ?? null,
    nextServiceOn: v.nextServiceOn ?? (v.intervalDays ? addDays(today, v.intervalDays) : null),
    note: v.note || null,
    active: v.active,
  };
  if (!id) {
    const [row] = await db
      .insert(equipment)
      .values({ ...values, restaurantId: ctx.restaurant.id })
      .returning();
    return row!;
  }
  const [row] = await db
    .update(equipment)
    .set(values)
    .where(and(eq(equipment.id, id), eq(equipment.restaurantId, ctx.restaurant.id)))
    .returning();
  if (!row) throw notFound();
  return row;
}

export async function deleteEquipment(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "tables.manage");
  await db
    .update(equipment)
    .set({ deletedAt: new Date(), active: false })
    .where(and(eq(equipment.id, id), eq(equipment.restaurantId, ctx.restaurant.id)));
}

/** A preventive service done today: the next one is due in `intervalDays`. */
export async function markServiced(db: Database, ctx: RestaurantContext, id: string, note?: string) {
  assertCan(ctx, "orders.update_status");
  const today = (await getPmsSettings(db, ctx.restaurant.id, ctx.restaurant.timezone)).businessDate;
  await db.transaction(async (tx) => {
    const [e] = await tx
      .select()
      .from(equipment)
      .where(and(eq(equipment.id, id), eq(equipment.restaurantId, ctx.restaurant.id)));
    if (!e) throw notFound();
    await tx
      .update(equipment)
      .set({ lastServiceOn: today, nextServiceOn: e.intervalDays ? addDays(today, e.intervalDays) : null })
      .where(eq(equipment.id, e.id));
    await recordAudit(tx, {
      action: "equipment.serviced",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "equipment",
      entityId: e.id,
      metadata: { name: e.name, note: note?.slice(0, 300) ?? null, day: today },
    });
  });
}

/** Reports: repair tickets by status and priority, average time to fix, services done. */
export async function engineeringReport(db: DbOrTx, ctx: RestaurantContext, from: string, to: string) {
  assertCan(ctx, "tables.view");
  const tz = ctx.restaurant.timezone;
  const inPeriod = (col: typeof maintenanceTickets.createdAt) =>
    and(
      gte(sql`(${col} at time zone ${tz})::date`, sql`${from}::date`),
      lte(sql`(${col} at time zone ${tz})::date`, sql`${to}::date`),
    );
  const tickets = await db
    .select({
      createdAt: maintenanceTickets.createdAt,
      room: diningTables.label,
      place: maintenanceTickets.place,
      title: maintenanceTickets.title,
      priority: maintenanceTickets.priority,
      status: maintenanceTickets.status,
      resolvedAt: maintenanceTickets.resolvedAt,
      assigned: users.fullName,
    })
    .from(maintenanceTickets)
    .leftJoin(diningTables, eq(diningTables.id, maintenanceTickets.roomId))
    .leftJoin(users, eq(users.id, maintenanceTickets.assignedToUserId))
    .where(
      and(eq(maintenanceTickets.restaurantId, ctx.restaurant.id), inPeriod(maintenanceTickets.createdAt)),
    )
    .orderBy(desc(maintenanceTickets.createdAt));
  const done = tickets.filter((t) => t.resolvedAt);
  const avgHours = done.length
    ? Math.round(
        done.reduce((s, t) => s + (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 3_600_000, 0) /
          done.length,
      )
    : 0;
  const services = await db
    .select({ at: auditLogs.createdAt, meta: auditLogs.metadata, by: users.fullName })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(
      and(
        eq(auditLogs.restaurantId, ctx.restaurant.id),
        eq(auditLogs.action, "equipment.serviced"),
        inPeriod(auditLogs.createdAt as never),
      ),
    )
    .orderBy(desc(auditLogs.createdAt));
  const count = (k: string, v: string) =>
    tickets.filter((t) => (t as Record<string, unknown>)[k] === v).length;
  const ticketsTable: Table = {
    cols: [
      { key: "at", type: "datetime" },
      { key: "room", type: "text" },
      { key: "title", type: "text" },
      { key: "priority", type: "code", ns: "engineering.priority" },
      { key: "status", type: "code", ns: "engineering.status" },
      { key: "assigned", type: "text" },
    ],
    rows: tickets.map((t) => ({
      at: t.createdAt.toISOString(),
      room: t.room ?? t.place ?? "—",
      title: t.title,
      priority: t.priority,
      status: t.status,
      assigned: t.assigned ?? "—",
    })),
  };
  const servicesTable: Table = {
    cols: [
      { key: "at", type: "datetime" },
      { key: "equipment", type: "text" },
      { key: "note", type: "text" },
      { key: "user", type: "text" },
    ],
    rows: services.map((s) => {
      const m = (s.meta ?? {}) as { name?: string; note?: string | null };
      return { at: s.at.toISOString(), equipment: m.name ?? "—", note: m.note ?? "", user: s.by ?? "—" };
    }),
  };
  return {
    summary: {
      total: tickets.length,
      open: count("status", "open") + count("status", "in_progress"),
      done: count("status", "done"),
      urgent: count("priority", "urgent"),
      avgHours,
      services: services.length,
    },
    tickets: ticketsTable,
    services: servicesTable,
  };
}
