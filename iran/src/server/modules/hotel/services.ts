import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  diningTables,
  hotelGuests,
  pmsSettings,
  serviceItems,
  serviceTicketLines,
  serviceTickets,
  stays,
  users,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { mainFolioOf, postLine } from "@/server/modules/pms/folios";
import { getPmsSettings } from "@/server/modules/pms/setup";
import type { Cell, Table } from "@/server/modules/pms/desk-reports";

/**
 * Laundry (لاندری) and damages (خسارت): a price list per department, tickets registered for an
 * in-house room or a walk-in guest, settled on the room's bill or at the department's cash desk
 * (cash, card, POS), or — damages only — waived. Plus the settings of every service department.
 */

export const SERVICE_KINDS = ["laundry", "damage"] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];
export const isServiceKind = (v: unknown): v is ServiceKind => SERVICE_KINDS.includes(v as ServiceKind);
export const LAUNDRY_STATUSES = ["received", "in_progress", "ready", "delivered"] as const;
export const SETTLEMENTS = ["room", "cash", "card", "pos"] as const;

// ─── Settings of the service departments ─────────────────────────────────────

const bool = (d: boolean) => z.coerce.boolean().default(d);
export const servicesSettingsSchema = z.object({
  laundry: z
    .object({
      /** Express surcharge, % of the ticket. */
      expressPct: z.coerce.number().int().min(0).max(300).default(50),
      /** Hours until a bag is ready (express: half). */
      readyHours: z.coerce.number().int().min(1).max(168).default(24),
      settleToRoom: bool(true),
    })
    .prefault({}),
  damage: z.object({ settleToRoom: bool(true) }).prefault({}),
  internet: z
    .object({
      autoCreate: bool(false),
      profileId: z.uuid().nullable().default(null),
      usernameMode: z.enum(["room", "random"]).default("room"),
      passwordLength: z.coerce.number().int().min(4).max(16).default(6),
      disableOnCheckout: bool(true),
    })
    .prefault({}),
  tv: z
    .object({
      autoActivate: bool(true),
      deactivateOnCheckout: bool(true),
      welcome: z.string().trim().max(300).default(""),
      server: z.string().trim().max(200).default(""),
      packages: z
        .array(
          z.object({ name: z.string().trim().min(1).max(60), priceCents: z.coerce.number().int().min(0) }),
        )
        .max(20)
        .default([]),
    })
    .prefault({}),
  housekeeping: z
    .object({
      /** At each night audit, occupied rooms go back to dirty (daily stayover cleaning). */
      dirtyStayoversDaily: bool(true),
      /** Check-in only into inspected rooms (not merely cleaned). */
      inspectionRequired: bool(false),
      /** Cleaning credits (minutes) per room type id. */
      credits: z.record(z.string(), z.coerce.number().int().min(0).max(600)).default({}),
    })
    .prefault({}),
  engineering: z
    .object({
      categories: z
        .array(z.string().trim().min(1).max(40))
        .max(40)
        .default(["تأسیسات", "برق", "سرمایش و گرمایش", "آسانسور", "لوله‌کشی", "مبلمان"]),
    })
    .prefault({}),
});
export type ServicesSettings = z.output<typeof servicesSettingsSchema>;
export type ServicesSection = keyof ServicesSettings;

export async function servicesSettings(db: DbOrTx, restaurantId: string, timezone: string) {
  const s = await getPmsSettings(db, restaurantId, timezone);
  const parsed = servicesSettingsSchema.safeParse(s.services ?? {});
  return parsed.success ? parsed.data : servicesSettingsSchema.parse({});
}

/** Saves one department's settings (the others are kept). */
export async function saveServicesSettings<K extends ServicesSection>(
  db: Database,
  ctx: RestaurantContext,
  section: K,
  raw: unknown,
) {
  assertCan(ctx, "rates.manage");
  const current = await servicesSettings(db, ctx.restaurant.id, ctx.restaurant.timezone);
  const next = servicesSettingsSchema.parse({ ...current, [section]: raw });
  await db
    .update(pmsSettings)
    .set({ services: next as unknown as Record<string, unknown> })
    .where(eq(pmsSettings.restaurantId, ctx.restaurant.id));
  await recordAudit(db, {
    action: "services.settings",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    metadata: { section },
  });
  return next[section];
}

// ─── Price list ──────────────────────────────────────────────────────────────

export const serviceItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().max(40).optional(),
  priceCents: z.coerce.number().int().min(0).max(1_000_000_000_000),
  active: z.coerce.boolean().default(true),
});

export async function listServiceItems(
  db: DbOrTx,
  restaurantId: string,
  kind: ServiceKind,
  activeOnly = false,
) {
  return db
    .select()
    .from(serviceItems)
    .where(
      and(
        eq(serviceItems.restaurantId, restaurantId),
        eq(serviceItems.kind, kind),
        isNull(serviceItems.deletedAt),
        activeOnly ? eq(serviceItems.active, true) : undefined,
      ),
    )
    .orderBy(asc(serviceItems.category), asc(serviceItems.sortOrder), asc(serviceItems.name));
}

export async function saveServiceItem(
  db: Database,
  ctx: RestaurantContext,
  kind: ServiceKind,
  id: string | null,
  raw: z.input<typeof serviceItemSchema>,
) {
  assertCan(ctx, "rates.manage");
  const input = serviceItemSchema.parse(raw);
  const values = { ...input, category: input.category || null };
  if (!id) {
    const [row] = await db
      .insert(serviceItems)
      .values({ ...values, kind, restaurantId: ctx.restaurant.id })
      .returning();
    return row!;
  }
  const [row] = await db
    .update(serviceItems)
    .set(values)
    .where(
      and(
        eq(serviceItems.id, id),
        eq(serviceItems.restaurantId, ctx.restaurant.id),
        eq(serviceItems.kind, kind),
      ),
    )
    .returning();
  if (!row) throw notFound();
  return row;
}

export async function deleteServiceItem(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "rates.manage");
  await db
    .update(serviceItems)
    .set({ deletedAt: new Date(), active: false })
    .where(and(eq(serviceItems.id, id), eq(serviceItems.restaurantId, ctx.restaurant.id)));
}

// ─── Rooms in house (pickers) ────────────────────────────────────────────────

/** Occupied rooms with their stay and guest, for the registration forms. */
export async function inHouseRooms(db: DbOrTx, restaurantId: string) {
  return db
    .select({
      roomId: diningTables.id,
      room: diningTables.label,
      stayId: stays.id,
      guest: sql<string>`trim(concat_ws(' ', ${hotelGuests.firstName}, ${hotelGuests.lastName}))`,
      departure: stays.departure,
    })
    .from(stays)
    .innerJoin(diningTables, eq(diningTables.id, stays.roomId))
    .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
    .where(and(eq(stays.restaurantId, restaurantId), eq(stays.status, "in_house")))
    .orderBy(asc(diningTables.number), asc(diningTables.label));
}

async function stayInRoom(tx: DbOrTx, restaurantId: string, roomId: string) {
  const [s] = await tx
    .select({ id: stays.id, guestId: stays.guestId })
    .from(stays)
    .where(and(eq(stays.restaurantId, restaurantId), eq(stays.roomId, roomId), eq(stays.status, "in_house")));
  return s ?? null;
}

// ─── Tickets ─────────────────────────────────────────────────────────────────

export const serviceTicketSchema = z
  .object({
    roomId: z.uuid().nullish(),
    guestName: z.string().trim().max(120).optional(),
    express: z.coerce.boolean().default(false),
    note: z.string().trim().max(500).optional(),
    lines: z
      .array(z.object({ itemId: z.uuid(), quantity: z.coerce.number().int().min(1).max(999) }))
      .min(1)
      .max(60),
    settle: z.enum(["room", "cash", "card", "pos", "pending"]).default("pending"),
  })
  .refine((v) => v.roomId || v.guestName, { message: "room_or_guest" });

const lineText = (lines: { name: string; quantity: number }[]) =>
  lines.map((l) => (l.quantity > 1 ? `${l.name} ×${l.quantity}` : l.name)).join("، ");

/** Posts a ticket on its stay's bill (inside the caller's transaction). */
async function postToRoom(
  tx: DbOrTx,
  ctx: RestaurantContext,
  t: typeof serviceTickets.$inferSelect,
  lines: { name: string; quantity: number }[],
) {
  if (!t.stayId) throw conflict("no_stay_in_room");
  const [s] = await tx.select({ status: stays.status }).from(stays).where(eq(stays.id, t.stayId));
  if (s?.status !== "in_house") throw conflict("not_in_house");
  const settings = await getPmsSettings(tx, ctx.restaurant.id, ctx.restaurant.timezone);
  const folio = await mainFolioOf(tx, ctx.restaurant.id, t.stayId);
  await postLine(tx, ctx.restaurant.id, ctx.restaurant.timezone, {
    folioId: folio.id,
    kind: "charge",
    department: t.kind,
    description: lineText(lines) || `#${t.number}`,
    quantity: 1,
    unitCents: t.totalCents,
    amountCents: t.totalCents,
    // A damage is compensation, not a sale: no VAT.
    taxRateBps: t.kind === "damage" ? 0 : settings.serviceTaxBps,
    sourceType: t.kind,
    sourceId: t.id,
    userId: ctx.user.id,
  });
}

export async function createServiceTicket(
  db: Database,
  ctx: RestaurantContext,
  kind: ServiceKind,
  raw: z.input<typeof serviceTicketSchema>,
) {
  assertCan(ctx, "folio.post");
  const input = serviceTicketSchema.parse(raw);
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    const settings = await getPmsSettings(tx, rid, ctx.restaurant.timezone);
    const conf = await servicesSettings(tx, rid, ctx.restaurant.timezone);
    let stayId: string | null = null;
    let guestName = input.guestName || null;
    if (input.roomId) {
      const [room] = await tx
        .select({ id: diningTables.id })
        .from(diningTables)
        .where(and(eq(diningTables.id, input.roomId), eq(diningTables.restaurantId, rid)));
      if (!room) throw notFound();
      const s = await stayInRoom(tx, rid, input.roomId);
      stayId = s?.id ?? null;
      if (s && !guestName) {
        const [g] = await tx
          .select({ n: sql<string>`trim(concat_ws(' ', ${hotelGuests.firstName}, ${hotelGuests.lastName}))` })
          .from(hotelGuests)
          .where(eq(hotelGuests.id, s.guestId));
        guestName = g?.n ?? null;
      }
    }
    if (input.settle === "room" && !stayId) throw conflict("no_stay_in_room");
    const items = await tx
      .select()
      .from(serviceItems)
      .where(
        and(
          eq(serviceItems.restaurantId, rid),
          eq(serviceItems.kind, kind),
          isNull(serviceItems.deletedAt),
          inArray(
            serviceItems.id,
            input.lines.map((l) => l.itemId),
          ),
        ),
      );
    const byId = new Map(items.map((i) => [i.id, i]));
    if (input.lines.some((l) => !byId.has(l.itemId))) throw notFound("item_not_found");
    const lines = input.lines.map((l) => {
      const it = byId.get(l.itemId)!;
      return {
        itemId: it.id,
        name: it.name,
        quantity: l.quantity,
        unitCents: it.priceCents,
        amountCents: it.priceCents * l.quantity,
      };
    });
    const express = kind === "laundry" && input.express;
    if (express && conf.laundry.expressPct) {
      const base = lines.reduce((s, l) => s + l.amountCents, 0);
      const extra = Math.round((base * conf.laundry.expressPct) / 100);
      if (extra)
        lines.push({
          itemId: null as unknown as string,
          name: "express",
          quantity: 1,
          unitCents: extra,
          amountCents: extra,
        });
    }
    const total = lines.reduce((s, l) => s + l.amountCents, 0);
    const [{ n } = { n: 0 }] = await tx
      .select({ n: sql<number>`coalesce(max(${serviceTickets.number}), 0)::int` })
      .from(serviceTickets)
      .where(and(eq(serviceTickets.restaurantId, rid), eq(serviceTickets.kind, kind)));
    const hours =
      kind === "laundry" ? Math.max(1, Math.round(conf.laundry.readyHours / (express ? 2 : 1))) : 0;
    const settled = input.settle !== "pending";
    const [ticket] = await tx
      .insert(serviceTickets)
      .values({
        restaurantId: rid,
        kind,
        number: Number(n) + 1,
        stayId,
        roomId: input.roomId ?? null,
        guestName,
        status: kind === "laundry" ? "received" : "open",
        express,
        note: input.note || null,
        totalCents: total,
        settlement: input.settle,
        settledAt: settled ? new Date() : null,
        settledByUserId: settled ? ctx.user.id : null,
        businessDate: settings.businessDate,
        dueAt: hours ? new Date(Date.now() + hours * 3_600_000) : null,
        createdByUserId: ctx.user.id,
      })
      .returning();
    await tx.insert(serviceTicketLines).values(
      lines.map((l) => ({
        ticketId: ticket!.id,
        itemId: l.itemId ?? null,
        name: l.name,
        quantity: l.quantity,
        unitCents: l.unitCents,
        amountCents: l.amountCents,
      })),
    );
    if (input.settle === "room")
      await postToRoom(
        tx,
        ctx,
        ticket!,
        lines.filter((l) => l.itemId),
      );
    await recordAudit(tx, {
      action: `${kind}.ticket`,
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "service_ticket",
      entityId: ticket!.id,
      metadata: { number: ticket!.number, totalCents: total, settle: input.settle },
    });
    return ticket!;
  });
}

async function lockTicket(tx: DbOrTx, rid: string, id: string) {
  const [t] = await tx
    .select()
    .from(serviceTickets)
    .where(and(eq(serviceTickets.id, id), eq(serviceTickets.restaurantId, rid)))
    .for("update");
  if (!t) throw notFound();
  return t;
}

/** Settles a pending ticket: on the room's bill, at the cash desk, or (damages) waived. */
export async function settleServiceTicket(
  db: Database,
  ctx: RestaurantContext,
  id: string,
  how: "room" | "cash" | "card" | "pos" | "waived",
) {
  assertCan(ctx, how === "waived" ? "folio.adjust" : "folio.post");
  return db.transaction(async (tx) => {
    const t = await lockTicket(tx, ctx.restaurant.id, id);
    if (t.status === "cancelled") throw conflict("ticket_cancelled");
    if (t.settlement !== "pending") throw conflict("ticket_settled");
    if (how === "waived" && t.kind !== "damage") throw conflict("not_waivable");
    if (how === "room") {
      const lines = await tx
        .select({
          name: serviceTicketLines.name,
          quantity: serviceTicketLines.quantity,
          itemId: serviceTicketLines.itemId,
        })
        .from(serviceTicketLines)
        .where(eq(serviceTicketLines.ticketId, t.id));
      await postToRoom(
        tx,
        ctx,
        t,
        lines.filter((l) => l.itemId),
      );
    }
    await tx
      .update(serviceTickets)
      .set({ settlement: how, settledAt: new Date(), settledByUserId: ctx.user.id })
      .where(eq(serviceTickets.id, t.id));
    await recordAudit(tx, {
      action: `${t.kind}.settled`,
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "service_ticket",
      entityId: t.id,
      metadata: { number: t.number, how },
    });
  });
}

/** Laundry workflow: received → in progress → ready → delivered. */
export async function setServiceTicketStatus(db: Database, ctx: RestaurantContext, id: string, raw: string) {
  assertCan(ctx, "orders.update_status");
  const status = z.enum(LAUNDRY_STATUSES).parse(raw);
  const [row] = await db
    .update(serviceTickets)
    .set({ status })
    .where(
      and(
        eq(serviceTickets.id, id),
        eq(serviceTickets.restaurantId, ctx.restaurant.id),
        eq(serviceTickets.kind, "laundry"),
        sql`${serviceTickets.status} <> 'cancelled'`,
      ),
    )
    .returning({ id: serviceTickets.id });
  if (!row) throw notFound();
}

/** Cancels a ticket not yet on a bill nor paid (one on a bill is voided from the folio). */
export async function cancelServiceTicket(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "folio.adjust");
  await db.transaction(async (tx) => {
    const t = await lockTicket(tx, ctx.restaurant.id, id);
    if (t.settlement === "room") throw conflict("ticket_on_bill");
    await tx.update(serviceTickets).set({ status: "cancelled" }).where(eq(serviceTickets.id, t.id));
    await recordAudit(tx, {
      action: `${t.kind}.cancelled`,
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "service_ticket",
      entityId: t.id,
      metadata: { number: t.number },
    });
  });
}

export type TicketFilter = { from: string; to: string; status?: string; settlement?: string; q?: string };

/** Tickets of a department over a period of business days, newest first, with their lines. */
export async function listServiceTickets(
  db: DbOrTx,
  ctx: RestaurantContext,
  kind: ServiceKind,
  f: TicketFilter,
) {
  assertCan(ctx, "frontdesk.view");
  const rows = await db
    .select({
      id: serviceTickets.id,
      number: serviceTickets.number,
      room: diningTables.label,
      roomId: serviceTickets.roomId,
      stayId: serviceTickets.stayId,
      guestName: serviceTickets.guestName,
      status: serviceTickets.status,
      express: serviceTickets.express,
      note: serviceTickets.note,
      totalCents: serviceTickets.totalCents,
      settlement: serviceTickets.settlement,
      businessDate: serviceTickets.businessDate,
      dueAt: serviceTickets.dueAt,
      createdAt: serviceTickets.createdAt,
      by: users.fullName,
    })
    .from(serviceTickets)
    .leftJoin(diningTables, eq(diningTables.id, serviceTickets.roomId))
    .leftJoin(users, eq(users.id, serviceTickets.createdByUserId))
    .where(
      and(
        eq(serviceTickets.restaurantId, ctx.restaurant.id),
        eq(serviceTickets.kind, kind),
        gte(serviceTickets.businessDate, f.from),
        lte(serviceTickets.businessDate, f.to),
        f.status ? eq(serviceTickets.status, f.status) : undefined,
        f.settlement ? eq(serviceTickets.settlement, f.settlement) : undefined,
        f.q
          ? sql`(${serviceTickets.guestName} ilike ${`%${f.q}%`} or ${diningTables.label} ilike ${`%${f.q}%`} or ${serviceTickets.number}::text = ${f.q})`
          : undefined,
      ),
    )
    .orderBy(desc(serviceTickets.createdAt))
    .limit(500);
  const lines = rows.length
    ? await db
        .select()
        .from(serviceTicketLines)
        .where(
          inArray(
            serviceTicketLines.ticketId,
            rows.map((r) => r.id),
          ),
        )
    : [];
  const byTicket = new Map<string, typeof lines>();
  for (const l of lines) byTicket.set(l.ticketId, [...(byTicket.get(l.ticketId) ?? []), l]);
  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    dueAt: r.dueAt?.toISOString() ?? null,
    lines: (byTicket.get(r.id) ?? []).map((l) => ({
      name: l.name,
      quantity: l.quantity,
      amountCents: l.amountCents,
      extra: !l.itemId,
    })),
  }));
}

/** صندوق: what the department took over the period, by way of settlement, then each ticket. */
export async function serviceCashbox(db: DbOrTx, ctx: RestaurantContext, kind: ServiceKind, f: TicketFilter) {
  const list = (await listServiceTickets(db, ctx, kind, f)).filter((t) => t.status !== "cancelled");
  const by: Record<string, { count: number; cents: number }> = {};
  for (const t of list) {
    const k = t.settlement;
    by[k] = { count: (by[k]?.count ?? 0) + 1, cents: (by[k]?.cents ?? 0) + t.totalCents };
  }
  const table: Table = {
    cols: [
      { key: "number", type: "ref" },
      { key: "date", type: "day" },
      { key: "room", type: "text" },
      { key: "guest", type: "text" },
      { key: "items", type: "text" },
      { key: "settlement", type: "code", ns: "services.settle" },
      { key: "amount", type: "money" },
    ],
    rows: list.map((t) => ({
      number: t.number,
      date: t.businessDate,
      room: t.room ?? "—",
      guest: t.guestName ?? "—",
      items: lineText(t.lines.filter((l) => !l.extra)),
      settlement: t.settlement,
      amount: t.totalCents,
    })),
  };
  table.totals = { number: "total", amount: list.reduce((s, t) => s + t.totalCents, 0) };
  return { table, by, total: table.totals.amount as number };
}

/** Report: quantities and amounts per item, then per business day. */
export async function serviceReport(db: DbOrTx, ctx: RestaurantContext, kind: ServiceKind, f: TicketFilter) {
  assertCan(ctx, "frontdesk.view");
  const where = and(
    eq(serviceTickets.restaurantId, ctx.restaurant.id),
    eq(serviceTickets.kind, kind),
    gte(serviceTickets.businessDate, f.from),
    lte(serviceTickets.businessDate, f.to),
    sql`${serviceTickets.status} <> 'cancelled'`,
  );
  const items = await db
    .select({
      item: serviceTicketLines.name,
      qty: sql<number>`sum(${serviceTicketLines.quantity})::int`,
      amount: sql<number>`sum(${serviceTicketLines.amountCents})::bigint`,
    })
    .from(serviceTicketLines)
    .innerJoin(serviceTickets, eq(serviceTickets.id, serviceTicketLines.ticketId))
    .where(where)
    .groupBy(serviceTicketLines.name)
    .orderBy(sql`sum(${serviceTicketLines.amountCents}) desc`);
  const days = await db
    .select({
      day: serviceTickets.businessDate,
      tickets: sql<number>`count(*)::int`,
      room: sql<number>`coalesce(sum(${serviceTickets.totalCents}) filter (where ${serviceTickets.settlement} = 'room'), 0)::bigint`,
      cash: sql<number>`coalesce(sum(${serviceTickets.totalCents}) filter (where ${serviceTickets.settlement} in ('cash','card','pos')), 0)::bigint`,
      pending: sql<number>`coalesce(sum(${serviceTickets.totalCents}) filter (where ${serviceTickets.settlement} = 'pending'), 0)::bigint`,
      amount: sql<number>`sum(${serviceTickets.totalCents})::bigint`,
    })
    .from(serviceTickets)
    .where(where)
    .groupBy(serviceTickets.businessDate)
    .orderBy(asc(serviceTickets.businessDate));
  const num = (v: unknown) => Number(v ?? 0);
  const sum = (rows: Record<string, Cell>[], k: string) => rows.reduce((s, r) => s + num(r[k]), 0);
  const itemRows = items.map((r) => ({
    item: r.item === "express" ? "express" : r.item,
    qty: num(r.qty),
    amount: num(r.amount),
  }));
  const dayRows = days.map((r) => ({
    day: r.day,
    tickets: num(r.tickets),
    room: num(r.room),
    cash: num(r.cash),
    pending: num(r.pending),
    amount: num(r.amount),
  }));
  const byItem: Table = {
    cols: [
      { key: "item", type: "text" },
      { key: "qty", type: "int" },
      { key: "amount", type: "money" },
    ],
    rows: itemRows,
    totals: { item: "total", qty: sum(itemRows, "qty"), amount: sum(itemRows, "amount") },
  };
  const byDay: Table = {
    cols: [
      { key: "day", type: "day" },
      { key: "tickets", type: "int" },
      { key: "room", type: "money" },
      { key: "cash", type: "money" },
      { key: "pending", type: "money" },
      { key: "amount", type: "money" },
    ],
    rows: dayRows,
    totals: {
      day: "total",
      ...Object.fromEntries(
        ["tickets", "room", "cash", "pending", "amount"].map((k) => [k, sum(dayRows, k)]),
      ),
    },
  };
  return { byItem, byDay };
}
