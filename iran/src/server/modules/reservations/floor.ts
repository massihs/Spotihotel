import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  diningTables,
  reservations,
  restaurantSettings,
  sessionParticipants,
  tableSessions,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { emit, topics } from "@/server/infra/realtime";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { randomToken } from "@/lib/ids";
import { agendaDay, assertTableFree } from "./service";

import { FLOOR_COLS, FLOOR_ROWS, TABLE_SHAPES, tableSize } from "@/lib/floor-plan";

export { FLOOR_COLS, FLOOR_ROWS };

type PlanTable = {
  id: string;
  label: string;
  capacity: number | null;
  zone: string | null;
  shape: string;
  posX: number | null;
  posY: number | null;
};

/**
 * Tables the owner never placed get a spot: row by row in their zone, after the placed ones,
 * one empty cell between tables (the plan still opens tidy before any editing).
 */
export function layoutTables(tables: PlanTable[]) {
  const byZone = new Map<string, PlanTable[]>();
  for (const t of tables) {
    const z = t.zone?.trim() || "";
    byZone.set(z, [...(byZone.get(z) ?? []), t]);
  }
  const out: (PlanTable & { x: number; y: number; w: number; h: number; zoneKey: string })[] = [];
  for (const [zoneKey, list] of byZone) {
    const placed = list.filter((t) => t.posX != null && t.posY != null);
    let x = 1;
    let y = placed.length
      ? Math.max(...placed.map((t) => t.posY! + tableSize(t.shape, t.capacity).h)) + 1
      : 1;
    let rowH = 0;
    for (const t of list) {
      const size = tableSize(t.shape, t.capacity);
      if (t.posX != null && t.posY != null) {
        out.push({ ...t, ...size, x: t.posX, y: t.posY, zoneKey });
        continue;
      }
      if (x + size.w > FLOOR_COLS - 1) {
        x = 1;
        y += rowH + 1;
        rowH = 0;
      }
      out.push({ ...t, ...size, x, y, zoneKey });
      x += size.w + 1;
      rowH = Math.max(rowH, size.h);
    }
  }
  return out;
}

/**
 * Everything the host stand shows for a day: the tables on the plan, the day's bookings, and
 * which tables have guests seated by a QR scan right now.
 */
export async function hostView(db: Database, ctx: RestaurantContext, day: string) {
  assertCan(ctx, "orders.view");
  const [agenda, tables, sessions, [settings]] = await Promise.all([
    agendaDay(db, ctx, day),
    db
      .select({
        id: diningTables.id,
        label: diningTables.label,
        capacity: diningTables.capacity,
        zone: diningTables.zone,
        shape: diningTables.shape,
        posX: diningTables.posX,
        posY: diningTables.posY,
      })
      .from(diningTables)
      .where(
        and(
          eq(diningTables.restaurantId, ctx.restaurant.id),
          isNull(diningTables.deletedAt),
          eq(diningTables.kind, "table"),
        ),
      )
      .orderBy(asc(diningTables.sortOrder), asc(diningTables.number), asc(diningTables.label)),
    db
      .select({ tableId: tableSessions.tableId, openedAt: tableSessions.openedAt, id: tableSessions.id })
      .from(tableSessions)
      .where(and(eq(tableSessions.restaurantId, ctx.restaurant.id), eq(tableSessions.status, "open"))),
    db
      .select({ maxParty: restaurantSettings.reservationMaxParty })
      .from(restaurantSettings)
      .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id)),
  ]);
  const people = sessions.length
    ? await db
        .select({ sessionId: sessionParticipants.tableSessionId })
        .from(sessionParticipants)
        .where(
          inArray(
            sessionParticipants.tableSessionId,
            sessions.map((s) => s.id),
          ),
        )
    : [];
  const count = new Map<string, number>();
  for (const p of people) count.set(p.sessionId, (count.get(p.sessionId) ?? 0) + 1);
  return {
    ...agenda,
    maxParty: settings?.maxParty ?? 12,
    tables: layoutTables(tables),
    occupied: sessions.map((s) => ({
      tableId: s.tableId,
      since: s.openedAt,
      people: count.get(s.id) ?? 0,
    })),
  };
}

export const floorPlanSchema = z
  .array(
    z.object({
      id: z.uuid(),
      x: z
        .number()
        .int()
        .min(0)
        .max(FLOOR_COLS - 1),
      y: z
        .number()
        .int()
        .min(0)
        .max(FLOOR_ROWS - 1),
      shape: z.enum(TABLE_SHAPES),
    }),
  )
  .max(300);

/** Saves where each table stands on the plan and its shape. */
export async function saveFloorPlan(db: Database, ctx: RestaurantContext, raw: unknown) {
  assertCan(ctx, "tables.manage");
  const items = floorPlanSchema.parse(raw);
  await db.transaction(async (tx) => {
    for (const it of items)
      await tx
        .update(diningTables)
        .set({ posX: it.x, posY: it.y, shape: it.shape })
        .where(and(eq(diningTables.id, it.id), eq(diningTables.restaurantId, ctx.restaurant.id)));
    await recordAudit(tx, {
      action: "tables.floor_plan",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      metadata: { tables: items.length },
    });
  });
}

export const walkInSchema = z.object({
  tableId: z.uuid(),
  partySize: z.coerce.number().int().min(1).max(200),
  name: z.string().trim().max(120).default(""),
});

/**
 * A guest without a booking sits down: the table is taken now for the usual sitting length,
 * and shows on the plan and the agenda like any booking (source walk_in).
 */
export async function seatWalkIn(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof walkInSchema>,
  walkInName: string,
) {
  assertCan(ctx, "orders.update_status");
  const input = walkInSchema.parse(raw);
  await assertTableFree(db, ctx.restaurant.id, input.tableId, input.partySize);
  const [s] = await db
    .select({ durationMin: restaurantSettings.reservationDurationMin })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  const now = new Date();
  return db.transaction(async (tx) => {
    const [r] = await tx
      .insert(reservations)
      .values({
        restaurantId: ctx.restaurant.id,
        kind: "booking",
        code: randomToken(12),
        name: input.name || walkInName,
        phone: "",
        partySize: input.partySize,
        startsAt: now,
        durationMin: s?.durationMin ?? 90,
        tableId: input.tableId,
        status: "seated",
        seatedAt: now,
        source: "walk_in",
        createdByUserId: ctx.user.id,
      })
      .returning();
    await emit(tx, { topic: topics.restaurant(ctx.restaurant.id), type: "notification.created" });
    return r!;
  });
}

/** For tests and callers that only need the plan. */
export async function tablesOnPlan(db: DbOrTx, restaurantId: string) {
  const rows = await db
    .select({
      id: diningTables.id,
      label: diningTables.label,
      capacity: diningTables.capacity,
      zone: diningTables.zone,
      shape: diningTables.shape,
      posX: diningTables.posX,
      posY: diningTables.posY,
    })
    .from(diningTables)
    .where(
      and(
        eq(diningTables.restaurantId, restaurantId),
        isNull(diningTables.deletedAt),
        eq(diningTables.kind, "table"),
      ),
    )
    .orderBy(asc(diningTables.sortOrder), asc(diningTables.label));
  return layoutTables(rows);
}
