import "server-only";
import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  kitchenStations,
  orderItems,
  orders,
  printJobs,
  printers,
  restaurantSettings,
  restaurants,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { sha256 } from "@/server/auth/tokens";
import { emit, topics } from "@/server/infra/realtime";
import { AppError, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid, randomToken } from "@/lib/ids";
import { formatMoney } from "@/lib/money";
import { renderTicket, ticketPng, toEscPos, type TicketBlock } from "./escpos";
import { authenticateDevice } from "@/server/modules/offline/service";

const MAX_ATTEMPTS = 5;
/** Tickets not printed within this delay are dropped: a late kitchen ticket does more harm than good. */
const STALE_MINUTES = 30;

// ─── Order goes to the kitchen ───────────────────────────────────────────────

/**
 * The order leaves the till for the kitchen and bar: screens are notified (`order.accepted`:
 * sound, browser auto-print) and a ticket is queued for each network printer concerned.
 * Called inside the transaction that accepts the order (or creates it already accepted).
 */
export async function sendToKitchen(
  tx: DbOrTx,
  rid: string,
  order: { id: string; number: string; tableLabel: string | null; placeKind?: string | null },
) {
  await emit(tx, {
    topic: topics.restaurant(rid),
    type: "order.accepted",
    data: {
      orderId: order.id,
      number: order.number,
      tableLabel: order.tableLabel ?? "",
      ...(order.placeKind === "room" ? { place: "room" } : {}),
    },
  });
  const list = await tx
    .select()
    .from(printers)
    .where(and(eq(printers.restaurantId, rid), eq(printers.isActive, true), isNull(printers.deletedAt)));
  if (list.length === 0) return;
  const stations = new Set(
    (
      await tx
        .select({ stationId: orderItems.stationId })
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id))
    ).map((r) => r.stationId),
  );
  const jobs = list
    .filter((p) => p.target !== "station" || !p.stationId || stations.has(p.stationId))
    .map((p) => ({ restaurantId: rid, printerId: p.id, orderId: order.id, kind: p.target }));
  if (jobs.length) await tx.insert(printJobs).values(jobs);
}

// ─── Settings: printers, agent, acceptance ───────────────────────────────────

const printerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  host: z
    .string()
    .trim()
    .min(3)
    .max(120)
    .regex(/^[A-Za-z0-9.-]+$/),
  port: z.coerce.number().int().min(1).max(65535).default(9100),
  paperMm: z.union([z.literal(80), z.literal(58)]).default(80),
  target: z.enum(["cashier", "station", "all"]),
  stationId: z.uuid().nullable(),
  copies: z.coerce.number().int().min(1).max(5).default(1),
});
export type PrinterInput = z.input<typeof printerSchema>;

export async function listPrinters(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  const [list, [s], recent] = await Promise.all([
    db
      .select()
      .from(printers)
      .where(and(eq(printers.restaurantId, ctx.restaurant.id), isNull(printers.deletedAt)))
      .orderBy(asc(printers.createdAt)),
    db
      .select({
        seenAt: restaurantSettings.printAgentSeenAt,
        hasToken: sql<boolean>`${restaurantSettings.printAgentTokenHash} is not null`,
        cashierAcceptance: restaurantSettings.cashierAcceptance,
      })
      .from(restaurantSettings)
      .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id)),
    db
      .select({
        printerId: printJobs.printerId,
        status: printJobs.status,
        error: printJobs.error,
        at: printJobs.updatedAt,
      })
      .from(printJobs)
      .where(
        and(
          eq(printJobs.restaurantId, ctx.restaurant.id),
          sql`${printJobs.createdAt} > now() - interval '1 day'`,
        ),
      )
      .orderBy(sql`${printJobs.createdAt} desc`)
      .limit(200),
  ]);
  return {
    printers: list.map((p) => {
      const last = recent.find((j) => j.printerId === p.id && j.status !== "pending");
      return {
        ...p,
        lastStatus: last?.status ?? null,
        lastError: last?.error ?? null,
        lastAt: last?.at ?? null,
      };
    }),
    pending: recent.filter((j) => j.status === "pending").length,
    agentSeenAt: s?.seenAt ?? null,
    agentOnline: !!s?.seenAt && s.seenAt.getTime() > Date.now() - 60_000,
    agentConfigured: !!s?.hasToken,
    cashierAcceptance: s?.cashierAcceptance ?? true,
  };
}

async function checkStation(db: DbOrTx, ctx: RestaurantContext, stationId: string | null) {
  if (!stationId) return null;
  const [s] = await db
    .select({ id: kitchenStations.id })
    .from(kitchenStations)
    .where(and(eq(kitchenStations.id, stationId), eq(kitchenStations.restaurantId, ctx.restaurant.id)));
  if (!s) throw new AppError("VALIDATION", "invalid_station", { field: "stationId" });
  return s.id;
}

export async function savePrinter(
  db: Database,
  ctx: RestaurantContext,
  id: string | null,
  raw: PrinterInput,
) {
  assertCan(ctx, "restaurant.manage");
  const input = printerSchema.parse(raw);
  const stationId = input.target === "station" ? await checkStation(db, ctx, input.stationId) : null;
  const values = { ...input, stationId };
  if (id) {
    if (!isUuid(id)) throw notFound();
    const [row] = await db
      .update(printers)
      .set(values)
      .where(and(eq(printers.id, id), eq(printers.restaurantId, ctx.restaurant.id)))
      .returning();
    if (!row) throw notFound();
    return row;
  }
  const [row] = await db
    .insert(printers)
    .values({ ...values, restaurantId: ctx.restaurant.id })
    .returning();
  return row!;
}

export async function deletePrinter(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "restaurant.manage");
  if (!isUuid(id)) throw notFound();
  await db
    .update(printers)
    .set({ deletedAt: new Date(), isActive: false })
    .where(and(eq(printers.id, id), eq(printers.restaurantId, ctx.restaurant.id)));
}

export async function setPrinterActive(db: Database, ctx: RestaurantContext, id: string, active: boolean) {
  assertCan(ctx, "restaurant.manage");
  if (!isUuid(id)) throw notFound();
  await db
    .update(printers)
    .set({ isActive: active })
    .where(and(eq(printers.id, id), eq(printers.restaurantId, ctx.restaurant.id)));
}

/** Queues a test ticket on one printer. */
export async function testPrinter(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "restaurant.manage");
  if (!isUuid(id)) throw notFound();
  const [p] = await db
    .select({ id: printers.id })
    .from(printers)
    .where(and(eq(printers.id, id), eq(printers.restaurantId, ctx.restaurant.id)));
  if (!p) throw notFound();
  await db.insert(printJobs).values({ restaurantId: ctx.restaurant.id, printerId: p.id, kind: "test" });
}

export async function setCashierAcceptance(db: Database, ctx: RestaurantContext, on: boolean) {
  assertCan(ctx, "restaurant.manage");
  await db
    .update(restaurantSettings)
    .set({ cashierAcceptance: on })
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
}

/**
 * New token for the local print agent. Shown once: only its hash is stored. The token starts
 * with the restaurant id so the agent's requests are routed without a lookup by secret.
 */
export async function newAgentToken(db: Database, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.manage");
  const secret = randomToken(32);
  await db.transaction(async (tx) => {
    await tx
      .update(restaurantSettings)
      .set({ printAgentTokenHash: sha256(secret), printAgentSeenAt: null })
      .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
    await recordAudit(tx, {
      action: "print.agent_token_created",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
    });
  });
  return `${ctx.restaurant.id}.${secret}`;
}

// ─── Agent side ──────────────────────────────────────────────────────────────

/** Restaurant id of a valid agent token, else null. Records the agent's last contact. */
export async function authenticateAgent(db: DbOrTx, token: string | null) {
  if (!token) return null;
  const [rid, secret] = token.split(".");
  if (!rid || !secret || !isUuid(rid)) return null;
  const [s] = await db
    .select({ hash: restaurantSettings.printAgentTokenHash })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, rid));
  const a = Buffer.from(sha256(secret));
  const b = Buffer.from(s?.hash ?? "");
  if (!s?.hash || a.length !== b.length || !timingSafeEqual(a, b)) {
    // The desktop app prints with its own device token.
    const device = await authenticateDevice(db, token);
    if (!device) return null;
    await db
      .update(restaurantSettings)
      .set({ printAgentSeenAt: new Date() })
      .where(eq(restaurantSettings.restaurantId, device.restaurantId));
    return device.restaurantId;
  }
  await db
    .update(restaurantSettings)
    .set({ printAgentSeenAt: new Date() })
    .where(eq(restaurantSettings.restaurantId, rid));
  return rid;
}

/** Leases up to 10 jobs and renders them: [{ id, host, port, data (base64 ESC/POS) }]. */
export async function leaseJobs(db: Database, rid: string) {
  await db
    .update(printJobs)
    .set({ status: "failed", error: "stale" })
    .where(
      and(
        eq(printJobs.restaurantId, rid),
        inArray(printJobs.status, ["pending", "printing"]),
        lt(printJobs.createdAt, new Date(Date.now() - STALE_MINUTES * 60_000)),
      ),
    );
  const leased = await db.execute<{ id: string }>(sql`
    update print_jobs set status = 'printing', attempts = attempts + 1,
      leased_until = now() + interval '60 seconds', updated_at = now()
    where id in (
      select id from print_jobs
      where restaurant_id = ${rid} and attempts < ${MAX_ATTEMPTS}
        and (status = 'pending' or (status = 'printing' and leased_until < now()))
      order by created_at limit 10
      for update skip locked
    )
    returning id`);
  const ids = leased.rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ job: printJobs, printer: printers })
    .from(printJobs)
    .innerJoin(printers, eq(printers.id, printJobs.printerId))
    .where(inArray(printJobs.id, ids))
    .orderBy(asc(printJobs.createdAt));
  const out: { id: string; host: string; port: number; data: string }[] = [];
  for (const { job, printer } of rows) {
    try {
      const bytes = await renderJobBytes(db, rid, job, printer);
      out.push({ id: job.id, host: printer.host, port: printer.port, data: bytes.toString("base64") });
    } catch (e) {
      await db
        .update(printJobs)
        .set({ status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : "render" })
        .where(eq(printJobs.id, job.id));
    }
  }
  return out;
}

export async function ackJob(db: Database, rid: string, jobId: string, ok: boolean, error?: string) {
  if (!isUuid(jobId)) throw notFound();
  const [job] = await db
    .select()
    .from(printJobs)
    .where(and(eq(printJobs.id, jobId), eq(printJobs.restaurantId, rid)));
  if (!job) throw notFound();
  await db
    .update(printJobs)
    .set(
      ok
        ? { status: "done", printedAt: new Date(), error: null }
        : { status: job.attempts >= MAX_ATTEMPTS ? "failed" : "pending", error: (error ?? "").slice(0, 300) },
    )
    .where(eq(printJobs.id, jobId));
}

// ─── Ticket content ──────────────────────────────────────────────────────────

type Job = typeof printJobs.$inferSelect;
type Printer = typeof printers.$inferSelect;

export async function ticketBlocks(
  db: DbOrTx,
  rid: string,
  job: Pick<Job, "kind" | "orderId">,
  printer: Pick<Printer, "stationId" | "name">,
) {
  const [r] = await db
    .select({ name: restaurants.name, timezone: restaurants.timezone, currency: restaurants.currency })
    .from(restaurants)
    .where(eq(restaurants.id, rid));
  if (!r) throw notFound();
  const time = (d: Date) =>
    new Intl.DateTimeFormat("fa-IR", { timeZone: r.timezone, hour: "2-digit", minute: "2-digit" }).format(d);
  if (job.kind === "test" || !job.orderId)
    return [
      { kind: "text", text: r.name, size: "lg", align: "center" },
      { kind: "text", text: "چاپ آزمایشی", size: "xl", align: "center" },
      { kind: "text", text: `${printer.name} · ${time(new Date())}`, size: "md", align: "center" },
      { kind: "rule" },
      { kind: "text", text: "چاپگر به درستی متصل است ✓", size: "md", align: "center" },
    ] satisfies TicketBlock[];

  const [o] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, job.orderId), eq(orders.restaurantId, rid)));
  if (!o) throw notFound();
  const items = await db
    .select({
      quantity: orderItems.quantity,
      name: orderItems.productName,
      options: orderItems.options,
      note: orderItems.note,
      lineTotal: orderItems.lineTotalCents,
      stationId: orderItems.stationId,
      stationName: kitchenStations.name,
    })
    .from(orderItems)
    .leftJoin(kitchenStations, eq(kitchenStations.id, orderItems.stationId))
    .where(eq(orderItems.orderId, o.id))
    .orderBy(asc(orderItems.createdAt));
  const station = job.kind === "station" && printer.stationId ? printer.stationId : null;
  const shown = station ? items.filter((i) => i.stationId === station) : items;
  const where =
    o.channel === "delivery"
      ? "ارسال با پیک"
      : o.channel === "takeaway"
        ? "بیرون‌بر"
        : `میز ${o.tableLabel ?? "—"}`;
  const money = (c: number) => formatMoney(c, r.currency, "fa");
  const blocks: TicketBlock[] = [
    { kind: "text", text: r.name, size: "md", align: "center" },
    {
      kind: "text",
      text:
        job.kind === "cashier"
          ? "فیش صندوق"
          : station
            ? (shown[0]?.stationName ?? printer.name)
            : "سفارش آشپزخانه",
      size: "sm",
      align: "center",
    },
    { kind: "text", text: o.number, size: "xl", align: "center" },
    { kind: "text", text: where, size: "lg", align: "center" },
    { kind: "text", text: time(o.acceptedAt ?? o.placedAt), size: "sm", align: "center" },
    { kind: "rule" },
  ];
  for (const i of shown) {
    if (job.kind === "cashier")
      blocks.push({ kind: "row", start: `${i.quantity} × ${i.name}`, end: money(i.lineTotal), size: "md" });
    else blocks.push({ kind: "text", text: `${i.quantity} × ${i.name}`, size: "lg" });
    if (i.options.length)
      blocks.push({ kind: "text", text: `   ${i.options.map((x) => x.valueName).join("، ")}`, size: "sm" });
    if (i.note) blocks.push({ kind: "text", text: `   « ${i.note} »`, size: "md" });
  }
  if (o.note) blocks.push({ kind: "rule" }, { kind: "text", text: `توضیح: ${o.note}`, size: "md" });
  if (o.channel === "delivery" && o.deliveryAddress)
    blocks.push(
      { kind: "rule" },
      {
        kind: "text",
        text: `${o.deliveryAddress}${o.customerPhone ? ` · ${o.customerPhone}` : ""}`,
        size: "sm",
      },
    );
  if (job.kind === "cashier") {
    blocks.push({ kind: "rule" });
    if (o.discountCents > 0)
      blocks.push({ kind: "row", start: "تخفیف", end: `-${money(o.discountCents)}`, size: "md" });
    if (o.deliveryFeeCents > 0)
      blocks.push({ kind: "row", start: "هزینه ارسال", end: money(o.deliveryFeeCents), size: "md" });
    blocks.push({ kind: "row", start: "جمع کل", end: money(o.totalCents), size: "lg" });
    blocks.push({
      kind: "text",
      text: o.paymentStatus === "paid" ? "پرداخت شده" : "پرداخت نشده",
      size: "sm",
      align: "center",
    });
  }
  return blocks;
}

async function renderJobBytes(db: DbOrTx, rid: string, job: Job, printer: Printer) {
  const blocks = await ticketBlocks(db, rid, job, printer);
  const img = await renderTicket(blocks, printer.paperMm === 58 ? 384 : 576);
  return toEscPos(img, printer.copies);
}

/** PNG of what a printer would print for a test ticket (settings preview). */
export async function previewTicket(db: DbOrTx, ctx: RestaurantContext, printerId: string) {
  assertCan(ctx, "restaurant.view");
  if (!isUuid(printerId)) throw notFound();
  const [p] = await db
    .select()
    .from(printers)
    .where(and(eq(printers.id, printerId), eq(printers.restaurantId, ctx.restaurant.id)));
  if (!p) throw notFound();
  const blocks = await ticketBlocks(db, ctx.restaurant.id, { kind: "test", orderId: null }, p);
  return ticketPng(await renderTicket(blocks, p.paperMm === 58 ? 384 : 576));
}

/** Whether guest orders must be accepted at the till before reaching the kitchen. */
export async function cashierAcceptanceOf(db: DbOrTx, restaurantId: string) {
  const [s] = await db
    .select({ on: restaurantSettings.cashierAcceptance })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, restaurantId));
  return s?.on ?? true;
}
