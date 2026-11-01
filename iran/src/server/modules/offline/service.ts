import "server-only";
import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  categories,
  diningTables,
  kitchenStations,
  offlineDevices,
  orderItems,
  orderStatusEvents,
  orders,
  paymentAllocations,
  payments,
  printers,
  products,
  restaurantMembers,
  restaurantSettings,
  restaurants,
  users,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { sha256 } from "@/server/auth/tokens";
import { emit, topics } from "@/server/infra/realtime";
import { notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid, randomToken } from "@/lib/ids";
import { MAX_AMOUNT_CENTS, taxFromGross, taxFromNet } from "@/lib/money";
import { normalizeIranMobile } from "@/lib/phone";
import { loadPricedProducts } from "@/server/modules/menu/public";
import { computeTotals } from "@/server/modules/pricing";
import { nextCounterValue } from "@/server/modules/restaurants/service";
import { applyOrderToStock } from "@/server/modules/inventory/service";
import { linkOrderCustomer } from "@/server/modules/customers/service";
import { emitPaymentUpdate, paymentConfig, settleAllocations } from "@/server/modules/payments/service";
import { seatTable } from "@/server/modules/pos/service";
import { stationsOf } from "@/server/modules/kitchen/stations";
import { nutritionOf } from "@/server/modules/nutrition/service";
import { dinerForOrder } from "@/server/modules/diners/service";
import { issueInvoiceInTx } from "@/server/modules/invoices/service";

/** Snapshot format: the desktop app refuses a snapshot newer than it understands. */
export const SNAPSHOT_VERSION = 1;
/** Orders older than this are not taken any more (a forgotten PC switched on weeks later). */
const MAX_AGE_DAYS = 14;

// ─── Devices ─────────────────────────────────────────────────────────────────

const deviceName = z.string().trim().min(1).max(60);

/** Links a desktop app to the restaurant. The token is returned once. */
export async function createDevice(db: Database, ctx: RestaurantContext, name: string) {
  assertCan(ctx, "restaurant.manage");
  const secret = randomToken(32);
  const [d] = await db
    .insert(offlineDevices)
    .values({
      restaurantId: ctx.restaurant.id,
      name: deviceName.parse(name),
      tokenHash: sha256(secret),
      createdByUserId: ctx.user.id,
    })
    .returning();
  await recordAudit(db, {
    action: "offline_device.created",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "offline_device",
    entityId: d!.id,
    metadata: { name: d!.name },
  });
  return { id: d!.id, name: d!.name, token: `${d!.id}.${secret}` };
}

export async function listDevices(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  return db
    .select({
      id: offlineDevices.id,
      name: offlineDevices.name,
      lastSeenAt: offlineDevices.lastSeenAt,
      lastSyncAt: offlineDevices.lastSyncAt,
      syncedOrders: offlineDevices.syncedOrders,
      appVersion: offlineDevices.appVersion,
      createdAt: offlineDevices.createdAt,
    })
    .from(offlineDevices)
    .where(and(eq(offlineDevices.restaurantId, ctx.restaurant.id), isNull(offlineDevices.revokedAt)))
    .orderBy(asc(offlineDevices.createdAt));
}

export async function revokeDevice(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "restaurant.manage");
  if (!isUuid(id)) throw notFound();
  const [d] = await db
    .update(offlineDevices)
    .set({ revokedAt: new Date() })
    .where(and(eq(offlineDevices.id, id), eq(offlineDevices.restaurantId, ctx.restaurant.id)))
    .returning({ id: offlineDevices.id });
  if (!d) throw notFound();
  await recordAudit(db, {
    action: "offline_device.revoked",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "offline_device",
    entityId: id,
  });
}

export type DeviceAuth = { deviceId: string; restaurantId: string; createdByUserId: string | null };

/** `<device id>.<secret>` → the device, or null (unknown, wrong secret, revoked, restaurant gone). */
export async function authenticateDevice(
  db: DbOrTx,
  token: string | null,
  appVersion?: string | null,
): Promise<DeviceAuth | null> {
  if (!token) return null;
  const [id, secret] = token.split(".");
  if (!id || !secret || !isUuid(id)) return null;
  const [d] = await db
    .select({
      id: offlineDevices.id,
      restaurantId: offlineDevices.restaurantId,
      hash: offlineDevices.tokenHash,
      revokedAt: offlineDevices.revokedAt,
      createdByUserId: offlineDevices.createdByUserId,
      status: restaurants.status,
      deletedAt: restaurants.deletedAt,
    })
    .from(offlineDevices)
    .innerJoin(restaurants, eq(restaurants.id, offlineDevices.restaurantId))
    .where(eq(offlineDevices.id, id));
  if (!d || d.revokedAt || d.deletedAt || d.status !== "active") return null;
  const a = Buffer.from(sha256(secret));
  const b = Buffer.from(d.hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  await db
    .update(offlineDevices)
    .set({
      lastSeenAt: new Date(),
      ...(appVersion ? { appVersion: appVersion.slice(0, 24) } : {}),
    })
    .where(eq(offlineDevices.id, d.id));
  return { deviceId: d.id, restaurantId: d.restaurantId, createdByUserId: d.createdByUserId };
}

/** Bearer token of a request. */
export const bearer = (req: Request) =>
  req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim() || null;

// ─── Snapshot: what the app needs to work without the internet ───────────────

export async function getSnapshot(db: DbOrTx, auth: DeviceAuth) {
  const rid = auth.restaurantId;
  const [[r], [s], cats, menu, tables, stations, printerRows, staff, pay] = await Promise.all([
    db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        slug: restaurants.slug,
        currency: restaurants.currency,
        timezone: restaurants.timezone,
        defaultLocale: restaurants.defaultLocale,
        brandColor: restaurants.brandColor,
        kind: restaurants.kind,
      })
      .from(restaurants)
      .where(eq(restaurants.id, rid)),
    db
      .select({
        pricesIncludeTax: restaurantSettings.pricesIncludeTax,
        orderPrefix: restaurantSettings.orderPrefix,
      })
      .from(restaurantSettings)
      .where(eq(restaurantSettings.restaurantId, rid)),
    db
      .select({
        id: categories.id,
        name: categories.name,
        icon: categories.icon,
        stationId: categories.stationId,
      })
      .from(categories)
      .where(
        and(eq(categories.restaurantId, rid), isNull(categories.deletedAt), eq(categories.isActive, true)),
      )
      .orderBy(asc(categories.sortOrder), asc(categories.createdAt)),
    loadPricedProducts(db, rid, {}),
    db
      .select({
        id: diningTables.id,
        label: diningTables.label,
        zone: diningTables.zone,
        capacity: diningTables.capacity,
      })
      .from(diningTables)
      .where(and(eq(diningTables.restaurantId, rid), isNull(diningTables.deletedAt)))
      .orderBy(asc(diningTables.sortOrder), asc(diningTables.label)),
    db
      .select({ id: kitchenStations.id, name: kitchenStations.name })
      .from(kitchenStations)
      .where(eq(kitchenStations.restaurantId, rid)),
    db
      .select({
        id: printers.id,
        name: printers.name,
        host: printers.host,
        port: printers.port,
        paperMm: printers.paperMm,
        target: printers.target,
        stationId: printers.stationId,
        copies: printers.copies,
      })
      .from(printers)
      .where(and(eq(printers.restaurantId, rid), eq(printers.isActive, true), isNull(printers.deletedAt))),
    db
      .select({
        userId: users.id,
        name: users.fullName,
        job: restaurantMembers.job,
        role: restaurantMembers.role,
      })
      .from(restaurantMembers)
      .innerJoin(users, eq(users.id, restaurantMembers.userId))
      .where(and(eq(restaurantMembers.restaurantId, rid), eq(restaurantMembers.status, "active")))
      .orderBy(asc(users.fullName)),
    paymentConfig(db, rid),
  ]);
  if (!r) throw notFound();
  const productStations = await stationsOf(
    db,
    rid,
    menu.map((p) => p.id),
  );
  return {
    version: SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    restaurant: { ...r, pricesIncludeTax: s?.pricesIncludeTax ?? true, orderPrefix: s?.orderPrefix ?? "A" },
    categories: cats,
    products: menu.map((p) => ({
      id: p.id,
      stationId: productStations.get(p.id) ?? null,
      categoryId: p.categoryId,
      name: p.name,
      priceCents: p.priceCents,
      takeawayPriceCents: p.takeawayPriceCents,
      taxRateBps: p.taxRateBps,
      isAvailable: p.isAvailable,
      optionGroups: p.optionGroups,
    })),
    tables,
    stations,
    printers: printerRows,
    staff,
    // Offline, only money handed over at the restaurant can be taken.
    payments: pay.offline.filter((c) => c === "cash" || c === "on_site_terminal"),
  };
}

// ─── Orders taken offline ────────────────────────────────────────────────────

const cents = z.number().int().min(0).max(MAX_AMOUNT_CENTS);
const offlineOrder = z.object({
  ref: z.uuid(),
  localNumber: z.string().trim().min(1).max(24),
  placedAt: z.coerce.date(),
  channel: z.enum(["dine_in", "takeaway"]),
  tableId: z.uuid().nullable().default(null),
  staffUserId: z.uuid().nullable().default(null),
  status: z.enum(["accepted", "preparing", "ready", "served", "cancelled"]),
  note: z.string().trim().max(500).default(""),
  customerPhone: z.string().trim().max(32).default(""),
  discountCents: cents.default(0),
  lines: z
    .array(
      z.object({
        productId: z.uuid().nullable(),
        categoryId: z.uuid().nullable().default(null),
        name: z.string().trim().min(1).max(120),
        categoryName: z.string().trim().max(80).nullable().default(null),
        unitPriceCents: cents,
        taxRateBps: z.number().int().min(0).max(10_000),
        quantity: z.number().int().min(1).max(99),
        note: z.string().trim().max(280).default(""),
        options: z
          .array(
            z.object({
              groupId: z.string().max(40),
              groupName: z.string().max(80),
              valueId: z.string().max(40),
              valueName: z.string().max(80),
              priceDeltaCents: z.number().int().min(-MAX_AMOUNT_CENTS).max(MAX_AMOUNT_CENTS),
            }),
          )
          .max(50)
          .default([]),
      }),
    )
    .min(1)
    .max(100),
  payment: z
    .object({
      provider: z.enum(["cash", "on_site_terminal"]),
      tenderedCents: cents.nullable().default(null),
      at: z.coerce.date(),
    })
    .nullable()
    .default(null),
});
export const offlineBatchSchema = z.object({ orders: z.array(z.unknown()).min(1).max(200) });
export type OfflineOrderInput = z.input<typeof offlineOrder>;

type Result =
  | { ref: string; ok: true; orderId: string; number: string; duplicate: boolean }
  | { ref: string | null; ok: false; error: string };

/**
 * Brings the orders taken during an outage into the cloud. Each order is its own transaction and
 * is keyed by the device's id for it, so a retry after a dropped connection never doubles a
 * sale. The amounts are those shown and charged on site (the menu may have changed since); the
 * tickets were printed locally, so nothing is sent to the printers again.
 */
export async function importOfflineOrders(db: Database, auth: DeviceAuth, raw: unknown) {
  const batch = offlineBatchSchema.parse(raw);
  const results: Result[] = [];
  for (const item of batch.orders) {
    const parsed = offlineOrder.safeParse(item);
    if (!parsed.success) {
      const ref = (item as { ref?: unknown })?.ref;
      results.push({ ref: typeof ref === "string" ? ref : null, ok: false, error: "invalid" });
      continue;
    }
    try {
      results.push(await importOne(db, auth, parsed.data));
    } catch (e) {
      console.error("[offline] import failed", parsed.data.ref, e instanceof Error ? e.message : e);
      results.push({ ref: parsed.data.ref, ok: false, error: e instanceof Error ? e.message : "internal" });
    }
  }
  const imported = results.filter((r) => r.ok && !r.duplicate).length;
  await db
    .update(offlineDevices)
    .set({
      lastSyncAt: new Date(),
      syncedOrders: sql`${offlineDevices.syncedOrders} + ${imported}`,
    })
    .where(eq(offlineDevices.id, auth.deviceId));
  return { results, imported };
}

async function existing(tx: DbOrTx, rid: string, ref: string) {
  const [o] = await tx
    .select({ id: orders.id, number: orders.number })
    .from(orders)
    .where(and(eq(orders.restaurantId, rid), eq(orders.offlineRef, ref)));
  return o ?? null;
}

async function importOne(
  db: Database,
  auth: DeviceAuth,
  input: z.output<typeof offlineOrder>,
): Promise<Result> {
  const rid = auth.restaurantId;
  const now = new Date();
  if (input.placedAt.getTime() > now.getTime() + 10 * 60_000)
    return { ref: input.ref, ok: false, error: "future" };
  if (input.placedAt.getTime() < now.getTime() - MAX_AGE_DAYS * 86_400_000)
    return { ref: input.ref, ok: false, error: "too_old" };
  const already = await existing(db, rid, input.ref);
  if (already)
    return { ref: input.ref, ok: true, orderId: already.id, number: already.number, duplicate: true };

  return db.transaction(async (tx) => {
    // Same ref sent twice at once: the second waits here and finds the first.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"offline:" + input.ref}, 0))`);
    const again = await existing(tx, rid, input.ref);
    if (again)
      return { ref: input.ref, ok: true as const, orderId: again.id, number: again.number, duplicate: true };

    // Ids from the device must be this restaurant's; unknown ones (deleted since) are dropped.
    const productIds = [...new Set(input.lines.map((l) => l.productId).filter((x): x is string => !!x))];
    const categoryIds = [...new Set(input.lines.map((l) => l.categoryId).filter((x): x is string => !!x))];
    // One connection per transaction: these run one after the other.
    const ownProducts = await (productIds.length
      ? tx
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.restaurantId, rid), inArray(products.id, productIds)))
      : []);
    const ownCategories = await (categoryIds.length
      ? tx
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.restaurantId, rid), inArray(categories.id, categoryIds)))
      : []);
    const table = await (input.channel === "dine_in" && input.tableId
      ? tx
          .select({ id: diningTables.id, label: diningTables.label, kind: diningTables.kind })
          .from(diningTables)
          .where(and(eq(diningTables.id, input.tableId), eq(diningTables.restaurantId, rid)))
          .then((r) => r[0] ?? null)
      : null);
    const staff = await (input.staffUserId
      ? tx
          .select({ userId: restaurantMembers.userId })
          .from(restaurantMembers)
          .where(
            and(eq(restaurantMembers.restaurantId, rid), eq(restaurantMembers.userId, input.staffUserId)),
          )
          .then((r) => r[0]?.userId ?? null)
      : null);
    const [settings] = await tx
      .select({
        pricesIncludeTax: restaurantSettings.pricesIncludeTax,
        orderPrefix: restaurantSettings.orderPrefix,
        currency: restaurants.currency,
      })
      .from(restaurantSettings)
      .innerJoin(restaurants, eq(restaurants.id, restaurantSettings.restaurantId))
      .where(eq(restaurantSettings.restaurantId, rid));
    const knownProduct = new Set(ownProducts.map((p) => p.id));
    const knownCategory = new Set(ownCategories.map((c) => c.id));
    const pricesIncludeTax = settings?.pricesIncludeTax ?? true;
    const actor = staff ?? auth.createdByUserId;

    // Amounts are recomputed from the unit prices; the device's totals are not trusted as such.
    const lines = input.lines.map((l) => {
      const optionsTotalCents = l.options.reduce((s, o) => s + o.priceDeltaCents, 0);
      const unitTotal = Math.max(0, l.unitPriceCents + optionsTotalCents);
      return { ...l, optionsTotalCents, lineTotalCents: unitTotal * l.quantity };
    });
    const totals = computeTotals(lines, pricesIncludeTax);
    const discountCents = Math.min(input.discountCents, totals.totalCents);
    const totalCents = totals.totalCents - discountCents;
    const taxCents =
      totals.totalCents > 0 ? Math.round(totals.taxCents * (totalCents / totals.totalCents)) : 0;
    const cancelled = input.status === "cancelled";
    const paid = !cancelled && !!input.payment && totalCents > 0;
    // Unpaid at a table: the order joins the table's bill so it can be settled there.
    const sessionId = table && !paid && !cancelled ? await seatTable(tx, rid, table.id) : null;

    const seq = await nextCounterValue(tx, rid, "order", 1001);
    const number = `${settings?.orderPrefix ?? "A"}-${seq}`;
    const at = input.placedAt;
    const reached = (s: string) =>
      ["accepted", "preparing", "ready", "served"].indexOf(input.status) >=
      ["accepted", "preparing", "ready", "served"].indexOf(s);
    const [order] = await tx
      .insert(orders)
      .values({
        restaurantId: rid,
        number,
        seq,
        channel: input.channel,
        tableId: table?.id ?? null,
        tableSessionId: sessionId,
        tableLabel: table?.label ?? null,
        placeKind: table?.kind === "room" ? "room" : null,
        status: input.status,
        paymentStatus: "unpaid",
        currency: settings?.currency ?? "IRR",
        subtotalCents: totals.subtotalCents,
        discountCents,
        taxCents,
        totalCents,
        pricesIncludeTax,
        note: input.note || null,
        customerPhone: normalizeIranMobile(input.customerPhone) ?? null,
        dinerId: await dinerForOrder(tx, { phone: input.customerPhone }),
        createdByUserId: actor,
        placedAt: at,
        acceptedAt: at,
        ...(cancelled
          ? { cancelledAt: at, cancelReason: "offline" }
          : {
              preparingAt: reached("preparing") ? at : null,
              readyAt: reached("ready") ? at : null,
              servedAt: reached("served") ? at : null,
            }),
        offlineRef: input.ref,
        offlineNumber: input.localNumber,
      })
      .returning();

    const stations = await stationsOf(tx, rid, productIds);
    const nutrition = await nutritionOf(tx, rid, productIds);
    await tx.insert(orderItems).values(
      lines.map((l) => ({
        restaurantId: rid,
        orderId: order!.id,
        productId: l.productId && knownProduct.has(l.productId) ? l.productId : null,
        categoryId: l.categoryId && knownCategory.has(l.categoryId) ? l.categoryId : null,
        productName: l.name,
        categoryName: l.categoryName,
        stationId: (l.productId && stations.get(l.productId)) ?? null,
        nutrition: (l.productId ? nutrition.get(l.productId) : null) ?? null,
        unitPriceCents: l.unitPriceCents,
        optionsTotalCents: l.optionsTotalCents,
        quantity: l.quantity,
        lineTotalCents: l.lineTotalCents,
        taxRateBps: l.taxRateBps,
        taxCents: pricesIncludeTax
          ? taxFromGross(l.lineTotalCents, l.taxRateBps)
          : taxFromNet(l.lineTotalCents, l.taxRateBps),
        options: l.options,
        note: l.note || null,
      })),
    );
    await tx.insert(orderStatusEvents).values({
      restaurantId: rid,
      orderId: order!.id,
      fromStatus: null,
      toStatus: input.status,
      actorUserId: actor,
    });
    if (!cancelled) {
      await applyOrderToStock(tx, rid, order!.id, -1);
      if (order!.customerPhone) await linkOrderCustomer(tx, rid, order!.id, order!.customerPhone, "");
    }

    if (paid) {
      const [payment] = await tx
        .insert(payments)
        .values({
          restaurantId: rid,
          provider: input.payment!.provider,
          status: "succeeded",
          succeededAt: input.payment!.at,
          amountCents: totalCents,
          currency: order!.currency,
          idempotencyKey: `offline-${input.ref}`,
          recordedByUserId: actor,
          metadata: {
            offline: true,
            deviceId: auth.deviceId,
            ...(input.payment!.tenderedCents != null ? { tenderedCents: input.payment!.tenderedCents } : {}),
          },
        })
        .returning();
      await tx.insert(paymentAllocations).values({
        restaurantId: rid,
        paymentId: payment!.id,
        orderId: order!.id,
        amountCents: totalCents,
      });
      await settleAllocations(tx, payment!, actor);
      await emitPaymentUpdate(tx, payment!);
      await issueInvoiceInTx(tx, rid, payment!.id, actor);
    }

    await emit(tx, {
      topic: topics.restaurant(rid),
      type: "order.created",
      data: {
        orderId: order!.id,
        number,
        tableId: table?.id ?? null,
        tableLabel: table?.label ?? "",
        source: "offline",
      },
    });
    await recordAudit(tx, {
      action: "order.offline_synced",
      actorUserId: actor,
      restaurantId: rid,
      entityType: "order",
      entityId: order!.id,
      metadata: {
        number,
        localNumber: input.localNumber,
        deviceId: auth.deviceId,
        totalCents,
        status: input.status,
        paid,
      },
    });
    return { ref: input.ref, ok: true as const, orderId: order!.id, number, duplicate: false };
  });
}
