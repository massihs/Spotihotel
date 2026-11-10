import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import {
  diningTables,
  folioLines,
  folios,
  hotelAccounts,
  hotelGuests,
  invoices,
  nightAudits,
  ratePlans,
  roomTypes,
  stayNights,
  stays,
  users,
} from "@/server/db/schema";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { addDays } from "./calc";
import { getPmsSettings } from "./setup";

/**
 * The front office's lists and reports, as plain tables (columns + rows + totals) that the pages
 * render, print and export the same way: reservations (list, cancellations, no-shows), the
 * cashier's (transactions, cash by day, foreign currencies, guests to settle) and the hotel's
 * reports (credit accounts, rate plans, bank, invoices, daily sales, expected guests, individual
 * guests, people, open folios, in-house debtors, room charges).
 */

export type Cell = string | number | null;
/**
 * text | money (minor units) | int | ref (a booking or folio number: no thousands separator) |
 * pct | day (YYYY-MM-DD) | datetime (ISO, shown in the hotel's time zone) | code (translated with `ns`).
 */
export type Col = {
  key: string;
  type: "text" | "money" | "int" | "ref" | "pct" | "day" | "datetime" | "code";
  ns?: string;
};
export type Table = { cols: Col[]; rows: Record<string, Cell>[]; totals?: Record<string, Cell> };
export type Period = { from: string; to: string; q?: string; method?: string; status?: string };

const txt = (key: string): Col => ({ key, type: "text" });
const money = (key: string): Col => ({ key, type: "money" });
const int = (key: string): Col => ({ key, type: "int" });
const ref = (key: string): Col => ({ key, type: "ref" });
const day = (key: string): Col => ({ key, type: "day" });
const code = (key: string, ns: string): Col => ({ key, type: "code", ns });

const guestName = sql<string>`trim(concat_ws(' ', ${hotelGuests.firstName}, ${hotelGuests.lastName}))`;
const nights = sql<number>`(${stays.departure} - ${stays.arrival})::int`;
const num = (v: unknown) => Number(v ?? 0);
const sum = (rows: Record<string, Cell>[], key: string) => rows.reduce((s, r) => s + num(r[key]), 0);
const totalsOf = (rows: Record<string, Cell>[], keys: string[], first: string, label = "total") =>
  Object.fromEntries([[first, label], ...keys.map((k) => [k, sum(rows, k)])]);

/** What the guest owes on their own folios (company folios excluded). */
const stayBalance = sql<number>`(select coalesce(sum(fl.amount_cents), 0) from folio_lines fl
  join folios f on f.id = fl.folio_id
  where f.stay_id = "stays"."id" and f.account_id is null and fl.voided_at is null)::bigint`;
/** Paid ahead on the guest's folios (deposits, prepayments). */
const paidOf = sql<number>`(select coalesce(-sum(fl.amount_cents), 0) from folio_lines fl
  join folios f on f.id = fl.folio_id
  where f.stay_id = "stays"."id" and fl.kind = 'payment' and fl.voided_at is null)::bigint`;

function stayQuery(db: DbOrTx) {
  return db
    .select({
      id: stays.id,
      number: stays.number,
      guest: guestName,
      phone: hotelGuests.phone,
      arrival: stays.arrival,
      departure: stays.departure,
      nights,
      room: diningTables.label,
      type: roomTypes.code,
      plan: ratePlans.code,
      adults: stays.adults,
      children: stays.children,
      source: stays.source,
      account: hotelAccounts.name,
      status: stays.status,
      guarantee: stays.guarantee,
      total: stays.totalCents,
      cancelledAt: stays.cancelledAt,
      cancelReason: stays.cancelReason,
    })
    .from(stays)
    .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
    .innerJoin(roomTypes, eq(roomTypes.id, stays.roomTypeId))
    .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
    .leftJoin(ratePlans, eq(ratePlans.id, stays.ratePlanId))
    .leftJoin(hotelAccounts, eq(hotelAccounts.id, stays.accountId));
}

/** Free text on the guest, the booking number, the room or the company. */
const searchStay = (q?: string) => {
  const s = q?.trim();
  if (!s) return undefined;
  const like = `%${s.replace(/[%_]/g, "")}%`;
  return or(
    sql`${guestName} ilike ${like}`,
    sql`${stays.number}::text = ${s.replace(/\D/g, "") || "-1"}`,
    sql`${diningTables.label} ilike ${like}`,
    sql`${hotelAccounts.name} ilike ${like}`,
    sql`${hotelGuests.phone} ilike ${like}`,
  );
};

// ─── Reservations ────────────────────────────────────────────────────────────

/** لیست رزرو: bookings arriving in the period (all statuses but cancelled unless asked). */
export async function reservationList(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "frontdesk.view");
  const statuses = p.status && p.status !== "all" ? [p.status] : ["tentative", "confirmed", "in_house"];
  const rows = await stayQuery(db)
    .where(
      and(
        eq(stays.restaurantId, ctx.restaurant.id),
        gte(stays.arrival, p.from),
        lte(stays.arrival, p.to),
        inArray(stays.status, statuses),
        searchStay(p.q),
      ),
    )
    .orderBy(asc(stays.arrival), asc(stays.number))
    .limit(2000);
  const out = rows.map((r) => ({
    id: r.id,
    number: r.number,
    guest: r.guest,
    arrival: r.arrival,
    departure: r.departure,
    nights: r.nights,
    room: r.room ?? "—",
    type: r.type,
    plan: r.plan ?? "—",
    pax: r.adults + r.children,
    source: r.source,
    account: r.account ?? "",
    status: r.status,
    total: r.total,
  }));
  return {
    cols: [
      ref("number"),
      txt("guest"),
      day("arrival"),
      day("departure"),
      int("nights"),
      txt("room"),
      txt("type"),
      txt("plan"),
      int("pax"),
      code("source", "pms.source"),
      txt("account"),
      code("status", "pms.status"),
      money("total"),
    ],
    rows: out,
    totals: totalsOf(out, ["nights", "pax", "total"], "number"),
  };
}

/** کنسل: bookings cancelled in the period, with the fee charged. */
export async function cancellations(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "frontdesk.view");
  const tz = ctx.restaurant.timezone;
  const rows = await stayQuery(db)
    .where(
      and(
        eq(stays.restaurantId, ctx.restaurant.id),
        eq(stays.status, "cancelled"),
        sql`(${stays.cancelledAt} at time zone ${tz})::date between ${p.from}::date and ${p.to}::date`,
        searchStay(p.q),
      ),
    )
    .orderBy(desc(stays.cancelledAt))
    .limit(2000);
  const fees = await feesByStay(db, ctx.restaurant.id, "cancellation", rows);
  const out = rows.map((r) => ({
    id: r.id,
    number: r.number,
    guest: r.guest,
    cancelledOn: r.cancelledAt ? localDate(r.cancelledAt, tz) : null,
    arrival: r.arrival,
    nights: r.nights,
    type: r.type,
    source: r.source,
    account: r.account ?? "",
    reason: r.cancelReason ?? "",
    total: r.total,
    fee: fees.get(r.number) ?? 0,
  }));
  return {
    cols: [
      ref("number"),
      txt("guest"),
      day("cancelledOn"),
      day("arrival"),
      int("nights"),
      txt("type"),
      code("source", "pms.source"),
      txt("account"),
      txt("reason"),
      money("total"),
      money("fee"),
    ],
    rows: out,
    totals: totalsOf(out, ["nights", "total", "fee"], "number"),
  };
}

/** نوشو (and, with `guaranteed`, نوشو قراردادهای گارانتی): no-shows of the period. */
export async function noShows(
  db: DbOrTx,
  ctx: RestaurantContext,
  p: Period,
  guaranteed = false,
): Promise<Table> {
  assertCan(ctx, "frontdesk.view");
  const rows = await stayQuery(db)
    .where(
      and(
        eq(stays.restaurantId, ctx.restaurant.id),
        eq(stays.status, "no_show"),
        gte(stays.arrival, p.from),
        lte(stays.arrival, p.to),
        guaranteed ? ne(stays.guarantee, "none") : undefined,
        searchStay(p.q),
      ),
    )
    .orderBy(desc(stays.arrival), asc(stays.number))
    .limit(2000);
  const fees = await feesByStay(db, ctx.restaurant.id, "no_show", rows);
  const out = rows.map((r) => ({
    id: r.id,
    number: r.number,
    guest: r.guest,
    phone: r.phone ?? "",
    arrival: r.arrival,
    nights: r.nights,
    type: r.type,
    source: r.source,
    account: r.account ?? "",
    guarantee: r.guarantee,
    total: r.total,
    fee: fees.get(r.number) ?? 0,
  }));
  return {
    cols: [
      ref("number"),
      txt("guest"),
      txt("phone"),
      day("arrival"),
      int("nights"),
      txt("type"),
      code("source", "pms.source"),
      txt("account"),
      code("guarantee", "pms.guarantee"),
      money("total"),
      money("fee"),
    ],
    rows: out,
    totals: totalsOf(out, ["nights", "total", "fee"], "number"),
  };
}

async function feesByStay(db: DbOrTx, rid: string, source: string, rows: { number: number }[]) {
  if (!rows.length) return new Map<number, number>();
  const list = await db
    .select({
      number: stays.number,
      fee: sql<number>`coalesce(sum(${folioLines.amountCents}), 0)::bigint`.mapWith(Number),
    })
    .from(folioLines)
    .innerJoin(folios, eq(folios.id, folioLines.folioId))
    .innerJoin(stays, eq(stays.id, folios.stayId))
    .where(
      and(
        eq(folioLines.restaurantId, rid),
        eq(folioLines.sourceType, source),
        isNull(folioLines.voidedAt),
        inArray(
          stays.number,
          rows.map((r) => r.number),
        ),
      ),
    )
    .groupBy(stays.number);
  return new Map(list.map((r) => [r.number, r.fee]));
}

const localDate = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);

/** رک رزرواسیون: every room today: who is in, who arrives, who leaves, its housekeeping state. */
export async function roomRack(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "frontdesk.view");
  const rid = ctx.restaurant.id;
  const { businessDate: today } = await getPmsSettings(db, rid, ctx.restaurant.timezone);
  const [rooms, list] = await Promise.all([
    db
      .select({
        id: diningTables.id,
        label: diningTables.label,
        number: diningTables.number,
        zone: diningTables.zone,
        housekeeping: diningTables.housekeeping,
        type: roomTypes.code,
      })
      .from(diningTables)
      .leftJoin(roomTypes, eq(roomTypes.id, diningTables.roomTypeId))
      .where(
        and(
          eq(diningTables.restaurantId, rid),
          eq(diningTables.kind, "room"),
          isNull(diningTables.deletedAt),
        ),
      )
      .orderBy(asc(diningTables.number), asc(diningTables.label)),
    db
      .select({
        id: stays.id,
        number: stays.number,
        roomId: stays.roomId,
        status: stays.status,
        arrival: stays.arrival,
        departure: stays.departure,
        guest: guestName,
        vip: hotelGuests.vip,
        pax: sql<number>`${stays.adults} + ${stays.children}`,
        balance: stayBalance,
      })
      .from(stays)
      .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
      .where(
        and(
          eq(stays.restaurantId, rid),
          isNotNull(stays.roomId),
          or(
            eq(stays.status, "in_house"),
            and(inArray(stays.status, ["confirmed", "tentative"]), eq(stays.arrival, today)),
          ),
        ),
      ),
  ]);
  const inHouse = new Map(list.filter((s) => s.status === "in_house").map((s) => [s.roomId, s]));
  const arriving = new Map(list.filter((s) => s.status !== "in_house").map((s) => [s.roomId, s]));
  const board = rooms.map((r) => {
    const occ = inHouse.get(r.id) ?? null;
    const arr = arriving.get(r.id) ?? null;
    const state =
      r.housekeeping === "out_of_order"
        ? "out_of_order"
        : occ
          ? occ.departure <= today
            ? "departing"
            : "occupied"
          : arr
            ? "arriving"
            : r.housekeeping === "dirty" || r.housekeeping === "cleaning"
              ? "dirty"
              : "vacant";
    return {
      ...r,
      floor: r.zone || (r.number ? String(Math.floor(r.number / 100)) : "—"),
      state,
      stay: occ
        ? {
            id: occ.id,
            number: occ.number,
            guest: occ.guest,
            vip: occ.vip,
            pax: Number(occ.pax),
            departure: occ.departure,
            balance: Number(occ.balance),
          }
        : null,
      arrival: arr
        ? { id: arr.id, number: arr.number, guest: arr.guest, vip: arr.vip, pax: Number(arr.pax) }
        : null,
    };
  });
  const count = (s: string) => board.filter((b) => b.state === s).length;
  return {
    today,
    rooms: board,
    counts: {
      occupied: count("occupied"),
      departing: count("departing"),
      arriving: count("arriving"),
      vacant: count("vacant"),
      dirty: count("dirty"),
      outOfOrder: count("out_of_order"),
    },
  };
}

// ─── Cashier ─────────────────────────────────────────────────────────────────

const paymentLines = (rid: string, p: Period) =>
  and(
    eq(folioLines.restaurantId, rid),
    eq(folioLines.kind, "payment"),
    isNull(folioLines.voidedAt),
    gte(folioLines.businessDate, p.from),
    lte(folioLines.businessDate, p.to),
  );

/**
 * تراکنش ها and جست و جو تراکنش: payments and refunds of the period (or matching a search: amount,
 * reference, folio or booking number, guest or company name), newest first.
 */
export async function transactions(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "folio.post");
  const rid = ctx.restaurant.id;
  const q = p.q?.trim().replace(/[%_]/g, "") ?? "";
  const digits = q.replace(/[^\d]/g, "");
  const holder = sql<string>`coalesce(${hotelAccounts.name}, ${guestName}, ${folios.label}, '')`;
  const rows = await db
    .select({
      id: folioLines.id,
      day: folioLines.businessDate,
      at: folioLines.createdAt,
      folio: folios.number,
      stay: stays.number,
      room: diningTables.label,
      holder,
      method: folioLines.method,
      reference: folioLines.reference,
      currency: folioLines.currency,
      foreignCents: folioLines.foreignCents,
      amount: sql<number>`(-${folioLines.amountCents})::bigint`.mapWith(Number),
      user: users.fullName,
    })
    .from(folioLines)
    .innerJoin(folios, eq(folios.id, folioLines.folioId))
    .leftJoin(stays, eq(stays.id, folios.stayId))
    .leftJoin(hotelGuests, eq(hotelGuests.id, sql`coalesce(${folios.guestId}, ${stays.guestId})`))
    .leftJoin(hotelAccounts, eq(hotelAccounts.id, folios.accountId))
    .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
    .leftJoin(users, eq(users.id, folioLines.postedByUserId))
    .where(
      and(
        paymentLines(rid, p),
        p.method ? eq(folioLines.method, p.method) : undefined,
        q
          ? or(
              sql`${holder} ilike ${`%${q}%`}`,
              sql`${folioLines.reference} ilike ${`%${q}%`}`,
              digits
                ? or(
                    sql`${folios.number}::text = ${digits}`,
                    sql`${stays.number}::text = ${digits}`,
                    sql`abs(${folioLines.amountCents}) = ${Number(digits) * (ctx.restaurant.currency === "IRR" ? 1000 : 100)}`,
                  )
                : undefined,
            )
          : undefined,
      ),
    )
    .orderBy(desc(folioLines.createdAt))
    .limit(3000);
  const out = rows.map((r) => ({
    day: r.day,
    time: new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: ctx.restaurant.timezone,
    }).format(r.at),
    folio: r.folio,
    stay: r.stay,
    room: r.room ?? "",
    holder: r.holder,
    method: r.method ?? "",
    reference: r.reference ?? "",
    foreign: r.currency ? `${(Number(r.foreignCents ?? 0) / 100).toLocaleString("en")} ${r.currency}` : "",
    amount: r.amount,
    user: r.user ?? "",
  }));
  return {
    cols: [
      day("day"),
      txt("time"),
      ref("folio"),
      ref("stay"),
      txt("room"),
      txt("holder"),
      code("method", "pms.method"),
      txt("reference"),
      txt("foreign"),
      money("amount"),
      txt("user"),
    ],
    rows: out,
    totals: totalsOf(out, ["amount"], "day"),
  };
}

/** گزارش روزانه نقدی: cash received and paid back each day, and what each receptionist took. */
export async function dailyCash(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "folio.post");
  const rows = await db
    .select({
      day: folioLines.businessDate,
      user: users.fullName,
      received:
        sql<number>`coalesce(sum(-${folioLines.amountCents}) filter (where ${folioLines.amountCents} < 0), 0)::bigint`.mapWith(
          Number,
        ),
      refunded:
        sql<number>`coalesce(sum(${folioLines.amountCents}) filter (where ${folioLines.amountCents} > 0), 0)::bigint`.mapWith(
          Number,
        ),
      count: sql<number>`count(*)::int`,
    })
    .from(folioLines)
    .leftJoin(users, eq(users.id, folioLines.postedByUserId))
    .where(
      and(paymentLines(ctx.restaurant.id, p), eq(folioLines.method, "cash"), isNull(folioLines.currency)),
    )
    .groupBy(folioLines.businessDate, users.fullName)
    .orderBy(asc(folioLines.businessDate), asc(users.fullName));
  const out = rows.map((r) => ({
    day: r.day,
    user: r.user ?? "—",
    count: r.count,
    received: r.received,
    refunded: r.refunded,
    net: r.received - r.refunded,
  }));
  return {
    cols: [day("day"), txt("user"), int("count"), money("received"), money("refunded"), money("net")],
    rows: out,
    totals: totalsOf(out, ["count", "received", "refunded", "net"], "day"),
  };
}

/** گزارش صندوق ارزی: foreign currency taken each day, with its value in the hotel's currency. */
export async function currencyReport(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "folio.post");
  const rows = await db
    .select({
      day: folioLines.businessDate,
      currency: folioLines.currency,
      method: folioLines.method,
      count: sql<number>`count(*)::int`,
      foreign:
        sql<number>`coalesce(sum(case when ${folioLines.amountCents} < 0 then ${folioLines.foreignCents} else -${folioLines.foreignCents} end), 0)::bigint`.mapWith(
          Number,
        ),
      value: sql<number>`coalesce(sum(-${folioLines.amountCents}), 0)::bigint`.mapWith(Number),
    })
    .from(folioLines)
    .where(and(paymentLines(ctx.restaurant.id, p), isNotNull(folioLines.currency)))
    .groupBy(folioLines.businessDate, folioLines.currency, folioLines.method)
    .orderBy(asc(folioLines.businessDate), asc(folioLines.currency));
  const out = rows.map((r) => ({
    day: r.day,
    currency: r.currency ?? "",
    method: r.method ?? "",
    count: r.count,
    foreign: (r.foreign / 100).toLocaleString("en", { maximumFractionDigits: 2 }),
    value: r.value,
  }));
  return {
    cols: [
      day("day"),
      txt("currency"),
      code("method", "pms.method"),
      int("count"),
      txt("foreign"),
      money("value"),
    ],
    rows: out,
    totals: totalsOf(out, ["count", "value"], "day"),
  };
}

/** گزارش کلی صندوق: takings of the period by receptionist and method. */
export async function cashierSummary(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "folio.post");
  const all = ctx.permissions.has("accounting.manage") || ctx.permissions.has("folio.adjust");
  const rows = await db
    .select({
      user: users.fullName,
      method: folioLines.method,
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(-${folioLines.amountCents}), 0)::bigint`.mapWith(Number),
    })
    .from(folioLines)
    .leftJoin(users, eq(users.id, folioLines.postedByUserId))
    .where(
      and(paymentLines(ctx.restaurant.id, p), all ? undefined : eq(folioLines.postedByUserId, ctx.user.id)),
    )
    .groupBy(users.fullName, folioLines.method);
  const methods = ["cash", "card", "transfer", "cheque", "online", "city_ledger", "deposit"];
  const byUser = new Map<string, Record<string, Cell>>();
  for (const r of rows) {
    const key = r.user ?? "—";
    const row = byUser.get(key) ?? { user: key, count: 0, total: 0 };
    const m = methods.includes(r.method ?? "") ? r.method! : "other";
    row[m] = num(row[m]) + r.total;
    row.count = num(row.count) + r.count;
    row.total = num(row.total) + r.total;
    byUser.set(key, row);
  }
  const used = methods.filter((m) => rows.some((r) => r.method === m));
  const out = [...byUser.values()].sort((a, b) => num(b.total) - num(a.total));
  return {
    cols: [
      txt("user"),
      int("count"),
      ...used.map((m) => ({ key: m, type: "money" as const })),
      money("total"),
    ],
    rows: out,
    totals: totalsOf(out, ["count", ...used, "total"], "user"),
  };
}

/** میهمان در انتظار تسویه: guests gone (or leaving today) whose own bill is not settled. */
export async function pendingSettlement(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "frontdesk.view");
  const { businessDate } = await getPmsSettings(db, ctx.restaurant.id, ctx.restaurant.timezone);
  const rows = await stayQuery(db)
    .where(
      and(
        eq(stays.restaurantId, ctx.restaurant.id),
        or(
          eq(stays.status, "checked_out"),
          and(eq(stays.status, "in_house"), lte(stays.departure, businessDate)),
          eq(stays.status, "no_show"),
          eq(stays.status, "cancelled"),
        ),
        sql`${stayBalance} <> 0`,
        searchStay(p.q),
      ),
    )
    .orderBy(asc(stays.departure))
    .limit(2000);
  const balances = await db
    .select({ number: stays.number, balance: stayBalance })
    .from(stays)
    .where(
      and(
        eq(stays.restaurantId, ctx.restaurant.id),
        inArray(stays.number, rows.map((r) => r.number).concat(-1)),
      ),
    );
  const owed = new Map(balances.map((b) => [b.number, Number(b.balance)]));
  const out = rows.map((r) => ({
    id: r.id,
    number: r.number,
    guest: r.guest,
    phone: r.phone ?? "",
    room: r.room ?? "",
    departure: r.departure,
    status: r.status,
    account: r.account ?? "",
    balance: owed.get(r.number) ?? 0,
  }));
  return {
    cols: [
      ref("number"),
      txt("guest"),
      txt("phone"),
      txt("room"),
      day("departure"),
      code("status", "pms.status"),
      txt("account"),
      money("balance"),
    ],
    rows: out,
    totals: totalsOf(out, ["balance"], "number"),
  };
}

// ─── Hotel reports ───────────────────────────────────────────────────────────

/** گزارش حسابهای اعتباری: each company / agency account, what it owes and its limit. */
export async function creditAccounts(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "analytics.view");
  const rid = ctx.restaurant.id;
  const like = p.q?.trim() ? `%${p.q.trim().replace(/[%_]/g, "")}%` : null;
  const rows = await db
    .select({
      name: hotelAccounts.name,
      kind: hotelAccounts.kind,
      phone: hotelAccounts.phone,
      limit: hotelAccounts.creditLimitCents,
      terms: hotelAccounts.paymentTermsDays,
      balance:
        sql<number>`(select coalesce(sum(fl.amount_cents), 0) from folio_lines fl join folios f on f.id = fl.folio_id
        where f.account_id = "hotel_accounts"."id" and fl.voided_at is null)::bigint`.mapWith(Number),
      lastPayment: sql<
        string | null
      >`(select max(fl.business_date)::text from folio_lines fl join folios f on f.id = fl.folio_id
        where f.account_id = "hotel_accounts"."id" and fl.kind = 'payment' and fl.voided_at is null)`,
      inHouse: sql<number>`(select count(*) from stays s where s.account_id = "hotel_accounts"."id" and s.status = 'in_house')::int`,
    })
    .from(hotelAccounts)
    .where(
      and(eq(hotelAccounts.restaurantId, rid), like ? sql`${hotelAccounts.name} ilike ${like}` : undefined),
    )
    .orderBy(asc(hotelAccounts.name));
  const out = rows.map((r) => ({
    name: r.name,
    kind: r.kind,
    phone: r.phone ?? "",
    inHouse: r.inHouse,
    limit: r.limit,
    balance: r.balance,
    available: r.limit ? r.limit - r.balance : null,
    terms: r.terms,
    lastPayment: r.lastPayment,
  }));
  return {
    cols: [
      txt("name"),
      code("kind", "pms.accountKind"),
      txt("phone"),
      int("inHouse"),
      money("limit"),
      money("balance"),
      money("available"),
      int("terms"),
      day("lastPayment"),
    ],
    rows: out,
    totals: totalsOf(out, ["inHouse", "balance"], "name"),
  };
}

/** گزارش عملکرد حساب اعتباری: what each account brought in the period. */
export async function accountPerformance(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "analytics.view");
  const rid = ctx.restaurant.id;
  const [sold, money2] = await Promise.all([
    db
      .select({
        id: hotelAccounts.id,
        stays: sql<number>`count(distinct ${stays.id})::int`,
        nights: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${stayNights.rateCents}), 0)::bigint`.mapWith(Number),
      })
      .from(stayNights)
      .innerJoin(stays, eq(stays.id, stayNights.stayId))
      .innerJoin(hotelAccounts, eq(hotelAccounts.id, stays.accountId))
      .where(
        and(
          eq(stayNights.restaurantId, rid),
          gte(stayNights.day, p.from),
          lte(stayNights.day, p.to),
          inArray(stays.status, ["in_house", "checked_out"]),
        ),
      )
      .groupBy(hotelAccounts.id),
    db
      .select({
        id: folios.accountId,
        charged:
          sql<number>`coalesce(sum(${folioLines.amountCents}) filter (where ${folioLines.kind} <> 'payment'), 0)::bigint`.mapWith(
            Number,
          ),
        paid: sql<number>`coalesce(-sum(${folioLines.amountCents}) filter (where ${folioLines.kind} = 'payment'), 0)::bigint`.mapWith(
          Number,
        ),
      })
      .from(folioLines)
      .innerJoin(folios, eq(folios.id, folioLines.folioId))
      .where(
        and(
          eq(folioLines.restaurantId, rid),
          isNotNull(folios.accountId),
          isNull(folioLines.voidedAt),
          gte(folioLines.businessDate, p.from),
          lte(folioLines.businessDate, p.to),
        ),
      )
      .groupBy(folios.accountId),
  ]);
  const accounts = await db
    .select({ id: hotelAccounts.id, name: hotelAccounts.name, kind: hotelAccounts.kind })
    .from(hotelAccounts)
    .where(eq(hotelAccounts.restaurantId, rid));
  const s = new Map(sold.map((r) => [r.id, r]));
  const m = new Map(money2.map((r) => [r.id, r]));
  const out = accounts
    .map((a) => {
      const x = s.get(a.id);
      const y = m.get(a.id);
      return {
        name: a.name,
        kind: a.kind,
        stays: x?.stays ?? 0,
        nights: x?.nights ?? 0,
        revenue: x?.revenue ?? 0,
        adr: x?.nights ? Math.round(x.revenue / x.nights) : 0,
        charged: y?.charged ?? 0,
        paid: y?.paid ?? 0,
      };
    })
    .filter((r) => r.nights || r.charged || r.paid)
    .sort((a, b) => b.revenue - a.revenue);
  return {
    cols: [
      txt("name"),
      code("kind", "pms.accountKind"),
      int("stays"),
      int("nights"),
      money("revenue"),
      money("adr"),
      money("charged"),
      money("paid"),
    ],
    rows: out,
    totals: totalsOf(out, ["stays", "nights", "revenue", "charged", "paid"], "name"),
  };
}

/** گزارش پلن فروش: nights and room revenue of each rate plan. */
export async function planSales(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "analytics.view");
  const rows = await db
    .select({
      plan: sql<string>`coalesce(${ratePlans.name}, '—')`,
      code: ratePlans.code,
      meal: ratePlans.mealPlan,
      stays: sql<number>`count(distinct ${stays.id})::int`,
      nights: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${stayNights.rateCents}), 0)::bigint`.mapWith(Number),
    })
    .from(stayNights)
    .innerJoin(stays, eq(stays.id, stayNights.stayId))
    .leftJoin(ratePlans, eq(ratePlans.id, stays.ratePlanId))
    .where(
      and(
        eq(stayNights.restaurantId, ctx.restaurant.id),
        gte(stayNights.day, p.from),
        lte(stayNights.day, p.to),
        inArray(stays.status, ["in_house", "checked_out"]),
      ),
    )
    .groupBy(ratePlans.name, ratePlans.code, ratePlans.mealPlan);
  const total = rows.reduce((s, r) => s + r.revenue, 0);
  const out = rows
    .map((r) => ({
      plan: r.plan,
      code: r.code ?? "",
      meal: r.meal ?? "",
      stays: r.stays,
      nights: r.nights,
      revenue: r.revenue,
      adr: r.nights ? Math.round(r.revenue / r.nights) : 0,
      share: total ? Math.round((r.revenue / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
  return {
    cols: [
      txt("plan"),
      txt("code"),
      code("meal", "pms.meal"),
      int("stays"),
      int("nights"),
      money("revenue"),
      money("adr"),
      { key: "share", type: "pct" },
    ],
    rows: out,
    totals: totalsOf(out, ["stays", "nights", "revenue"], "plan"),
  };
}

/** گزارش بانک: card, transfer, online and cheque takings of each day (what reaches the bank). */
export async function bankReport(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "analytics.view");
  const rows = await db
    .select({
      day: folioLines.businessDate,
      method: folioLines.method,
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(-${folioLines.amountCents}), 0)::bigint`.mapWith(Number),
    })
    .from(folioLines)
    .where(
      and(
        paymentLines(ctx.restaurant.id, p),
        inArray(folioLines.method, ["card", "transfer", "online", "cheque"]),
      ),
    )
    .groupBy(folioLines.businessDate, folioLines.method)
    .orderBy(asc(folioLines.businessDate));
  const byDay = new Map<string, Record<string, Cell>>();
  for (const r of rows) {
    const row = byDay.get(r.day) ?? {
      day: r.day,
      count: 0,
      card: 0,
      transfer: 0,
      online: 0,
      cheque: 0,
      total: 0,
    };
    row[r.method!] = num(row[r.method!]) + r.total;
    row.count = num(row.count) + r.count;
    row.total = num(row.total) + r.total;
    byDay.set(r.day, row);
  }
  const out = [...byDay.values()];
  return {
    cols: [
      day("day"),
      int("count"),
      money("card"),
      money("transfer"),
      money("online"),
      money("cheque"),
      money("total"),
    ],
    rows: out,
    totals: totalsOf(out, ["count", "card", "transfer", "online", "cheque", "total"], "day"),
  };
}

/** نمایش فاکتور فروش: the official invoices issued for stays in the period. */
export async function stayInvoiceList(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "analytics.view");
  const tz = ctx.restaurant.timezone;
  const rows = await db
    .select({
      number: invoices.number,
      issuedAt: invoices.issuedAt,
      snapshot: invoices.snapshot,
      total: invoices.totalCents,
      tax: invoices.taxCents,
      token: invoices.publicToken,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.restaurantId, ctx.restaurant.id),
        isNotNull(invoices.folioId),
        sql`(${invoices.issuedAt} at time zone ${tz})::date between ${p.from}::date and ${p.to}::date`,
      ),
    )
    .orderBy(desc(invoices.issuedAt))
    .limit(3000);
  const out = rows.map((r) => ({
    number: r.number,
    issued: localDate(r.issuedAt, tz),
    buyer: r.snapshot.buyer?.name ?? "",
    stay: r.snapshot.stay?.number ?? null,
    room: r.snapshot.stay?.room ?? "",
    net: r.total - r.tax,
    tax: r.tax,
    total: r.total,
    link: `/invoice/${r.token}`,
  }));
  return {
    cols: [
      txt("number"),
      day("issued"),
      txt("buyer"),
      ref("stay"),
      txt("room"),
      money("net"),
      money("tax"),
      money("total"),
    ],
    rows: out,
    totals: totalsOf(out, ["net", "tax", "total"], "number"),
  };
}

/** گزارش فروش روزانه: each closed day's revenue by department. */
export async function dailySales(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "analytics.view");
  const rows = await db
    .select()
    .from(nightAudits)
    .where(
      and(
        eq(nightAudits.restaurantId, ctx.restaurant.id),
        gte(nightAudits.businessDate, p.from),
        lte(nightAudits.businessDate, p.to),
      ),
    )
    .orderBy(asc(nightAudits.businessDate));
  const depts = [...new Set(rows.flatMap((r) => Object.keys(r.revenue ?? {})))].sort((a, b) =>
    a === "room" ? -1 : b === "room" ? 1 : a.localeCompare(b),
  );
  const out = rows.map((r) => ({
    day: r.businessDate,
    sold: r.roomsSold,
    ...Object.fromEntries(depts.map((d) => [d, num((r.revenue ?? {})[d])])),
    total: r.totalRevenueCents,
  }));
  return {
    cols: [
      day("day"),
      int("sold"),
      ...depts.map((d) => ({ key: d, type: "money" as const, ns: "pms.dept" })),
      money("total"),
    ],
    rows: out,
    totals: totalsOf(out, ["sold", ...depts, "total"], "day"),
  };
}

/** گزارش میهمانان مقیم آینده: guests expected in the period, with what they already paid. */
export async function expectedGuests(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "frontdesk.view");
  const rows = await db
    .select({
      id: stays.id,
      arrival: stays.arrival,
      number: stays.number,
      guest: guestName,
      phone: hotelGuests.phone,
      nights,
      room: diningTables.label,
      type: roomTypes.code,
      pax: sql<number>`${stays.adults} + ${stays.children}`,
      plan: ratePlans.code,
      source: stays.source,
      account: hotelAccounts.name,
      eta: stays.eta,
      guarantee: stays.guarantee,
      total: stays.totalCents,
      paid: paidOf,
    })
    .from(stays)
    .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
    .innerJoin(roomTypes, eq(roomTypes.id, stays.roomTypeId))
    .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
    .leftJoin(ratePlans, eq(ratePlans.id, stays.ratePlanId))
    .leftJoin(hotelAccounts, eq(hotelAccounts.id, stays.accountId))
    .where(
      and(
        eq(stays.restaurantId, ctx.restaurant.id),
        inArray(stays.status, ["confirmed", "tentative"]),
        gte(stays.arrival, p.from),
        lte(stays.arrival, p.to),
        searchStay(p.q),
      ),
    )
    .orderBy(asc(stays.arrival), asc(stays.eta), asc(stays.number))
    .limit(3000);
  const out = rows.map((r) => ({
    id: r.id,
    arrival: r.arrival,
    number: r.number,
    guest: r.guest,
    phone: r.phone ?? "",
    nights: r.nights,
    room: r.room ?? "—",
    type: r.type,
    pax: Number(r.pax),
    plan: r.plan ?? "",
    source: r.source,
    account: r.account ?? "",
    eta: r.eta ?? "",
    guarantee: r.guarantee,
    total: r.total,
    paid: Number(r.paid),
  }));
  return {
    cols: [
      day("arrival"),
      ref("number"),
      txt("guest"),
      txt("phone"),
      int("nights"),
      txt("room"),
      txt("type"),
      int("pax"),
      txt("plan"),
      code("source", "pms.source"),
      txt("account"),
      txt("eta"),
      code("guarantee", "pms.guarantee"),
      money("total"),
      money("paid"),
    ],
    rows: out,
    totals: totalsOf(out, ["nights", "pax", "total", "paid"], "arrival"),
  };
}

/** گزارش میهمانان آزاد: individual guests (no company or agency contract) who slept in the period. */
export async function individualGuests(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "analytics.view");
  const rows = await db
    .select({
      number: stays.number,
      guest: guestName,
      nationality: hotelGuests.nationality,
      room: diningTables.label,
      arrival: stays.arrival,
      departure: stays.departure,
      plan: ratePlans.code,
      source: stays.source,
      nights: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${stayNights.rateCents}), 0)::bigint`.mapWith(Number),
    })
    .from(stayNights)
    .innerJoin(stays, eq(stays.id, stayNights.stayId))
    .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
    .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
    .leftJoin(ratePlans, eq(ratePlans.id, stays.ratePlanId))
    .where(
      and(
        eq(stayNights.restaurantId, ctx.restaurant.id),
        gte(stayNights.day, p.from),
        lte(stayNights.day, p.to),
        inArray(stays.status, ["in_house", "checked_out"]),
        isNull(stays.accountId),
        notInArray(stays.source, [
          "agency",
          "booking",
          "expedia",
          "airbnb",
          "snapptrip",
          "alibaba",
          "jabama",
          "eghamat24",
        ]),
      ),
    )
    .groupBy(
      stays.id,
      stays.number,
      hotelGuests.firstName,
      hotelGuests.lastName,
      hotelGuests.nationality,
      diningTables.label,
      stays.arrival,
      stays.departure,
      ratePlans.code,
      stays.source,
    )
    .orderBy(asc(stays.arrival), asc(stays.number))
    .limit(3000);
  const out = rows.map((r) => ({
    number: r.number,
    guest: r.guest,
    nationality: r.nationality ?? "",
    room: r.room ?? "",
    arrival: r.arrival,
    departure: r.departure,
    plan: r.plan ?? "",
    source: r.source,
    nights: r.nights,
    revenue: r.revenue,
    adr: r.nights ? Math.round(r.revenue / r.nights) : 0,
  }));
  return {
    cols: [
      ref("number"),
      txt("guest"),
      txt("nationality"),
      txt("room"),
      day("arrival"),
      day("departure"),
      txt("plan"),
      code("source", "pms.source"),
      int("nights"),
      money("revenue"),
      money("adr"),
    ],
    rows: out,
    totals: totalsOf(out, ["nights", "revenue"], "number"),
  };
}

/** گزارش فروش نفرات: guests (adults and children) slept each night, and revenue per guest. */
export async function paxSales(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "analytics.view");
  const rows = await db
    .select({
      day: stayNights.day,
      rooms: sql<number>`count(*)::int`,
      adults: sql<number>`coalesce(sum(${stays.adults}), 0)::int`,
      children: sql<number>`coalesce(sum(${stays.children}), 0)::int`,
      revenue: sql<number>`coalesce(sum(${stayNights.rateCents}), 0)::bigint`.mapWith(Number),
    })
    .from(stayNights)
    .innerJoin(stays, eq(stays.id, stayNights.stayId))
    .where(
      and(
        eq(stayNights.restaurantId, ctx.restaurant.id),
        gte(stayNights.day, p.from),
        lte(stayNights.day, p.to),
        inArray(stays.status, ["in_house", "checked_out"]),
      ),
    )
    .groupBy(stayNights.day)
    .orderBy(asc(stayNights.day));
  const out = rows.map((r) => {
    const guests = r.adults + r.children;
    return {
      day: r.day,
      rooms: r.rooms,
      adults: r.adults,
      children: r.children,
      guests,
      perRoom: r.rooms ? Math.round((guests / r.rooms) * 10) / 10 : 0,
      revenue: r.revenue,
      perGuest: guests ? Math.round(r.revenue / guests) : 0,
    };
  });
  const t = totalsOf(out, ["rooms", "adults", "children", "guests", "revenue"], "day");
  t.perGuest = num(t.guests) ? Math.round(num(t.revenue) / num(t.guests)) : 0;
  return {
    cols: [
      day("day"),
      int("rooms"),
      int("adults"),
      int("children"),
      int("guests"),
      { key: "perRoom", type: "text" },
      money("revenue"),
      money("perGuest"),
    ],
    rows: out.map((r) => ({ ...r, perRoom: r.perRoom.toLocaleString("en") })),
    totals: t,
  };
}

/** رجیستر های مانده دار: every folio (guest, company, passer-by) whose balance is not zero. */
export async function openFolios(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "folio.post");
  const like = p.q?.trim() ? `%${p.q.trim().replace(/[%_]/g, "")}%` : null;
  const holder = sql<string>`coalesce(${hotelAccounts.name}, ${guestName}, ${folios.label}, '')`;
  const rows = await db
    .select({
      folio: folios.number,
      kind: sql<string>`case when ${folios.accountId} is not null then 'account' when ${folios.stayId} is not null then 'guest' else 'passer' end`,
      holder,
      stay: stays.number,
      room: diningTables.label,
      status: stays.status,
      folioStatus: folios.status,
      last: sql<string>`max(${folioLines.businessDate})::text`,
      balance: sql<number>`coalesce(sum(${folioLines.amountCents}), 0)::bigint`.mapWith(Number),
    })
    .from(folios)
    .innerJoin(folioLines, and(eq(folioLines.folioId, folios.id), isNull(folioLines.voidedAt)))
    .leftJoin(stays, eq(stays.id, folios.stayId))
    .leftJoin(hotelGuests, eq(hotelGuests.id, sql`coalesce(${folios.guestId}, ${stays.guestId})`))
    .leftJoin(hotelAccounts, eq(hotelAccounts.id, folios.accountId))
    .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
    .where(and(eq(folios.restaurantId, ctx.restaurant.id), like ? sql`${holder} ilike ${like}` : undefined))
    .groupBy(
      folios.id,
      folios.number,
      folios.accountId,
      folios.stayId,
      folios.label,
      folios.status,
      hotelAccounts.name,
      hotelGuests.firstName,
      hotelGuests.lastName,
      stays.number,
      stays.status,
      diningTables.label,
    )
    .having(sql`coalesce(sum(${folioLines.amountCents}), 0) <> 0`)
    .orderBy(desc(sql`coalesce(sum(${folioLines.amountCents}), 0)`))
    .limit(3000);
  const out = rows.map((r) => ({
    folio: r.folio,
    kind: r.kind,
    holder: r.holder,
    stay: r.stay,
    room: r.room ?? "",
    status: r.status ?? r.folioStatus,
    last: r.last,
    balance: r.balance,
  }));
  return {
    cols: [
      ref("folio"),
      code("kind", "deskReports.folioKind"),
      txt("holder"),
      ref("stay"),
      txt("room"),
      code("status", "pms.status"),
      day("last"),
      money("balance"),
    ],
    rows: out,
    totals: totalsOf(out, ["balance"], "folio"),
  };
}

/** بدهکاران مقیم: guests in house who owe on their own bill, the largest first. */
export async function inHouseDebtors(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "frontdesk.view");
  const rows = await db
    .select({
      id: stays.id,
      room: diningTables.label,
      number: stays.number,
      guest: guestName,
      phone: hotelGuests.phone,
      arrival: stays.arrival,
      departure: stays.departure,
      account: hotelAccounts.name,
      guarantee: stays.guarantee,
      balance: stayBalance,
    })
    .from(stays)
    .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
    .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
    .leftJoin(hotelAccounts, eq(hotelAccounts.id, stays.accountId))
    .where(
      and(
        eq(stays.restaurantId, ctx.restaurant.id),
        eq(stays.status, "in_house"),
        sql`${stayBalance} > 0`,
        searchStay(p.q),
      ),
    )
    .orderBy(desc(stayBalance))
    .limit(3000);
  const out = rows.map((r) => ({
    id: r.id,
    room: r.room ?? "",
    number: r.number,
    guest: r.guest,
    phone: r.phone ?? "",
    arrival: r.arrival,
    departure: r.departure,
    account: r.account ?? "",
    guarantee: r.guarantee,
    balance: Number(r.balance),
  }));
  return {
    cols: [
      txt("room"),
      ref("number"),
      txt("guest"),
      txt("phone"),
      day("arrival"),
      day("departure"),
      txt("account"),
      code("guarantee", "pms.guarantee"),
      money("balance"),
    ],
    rows: out,
    totals: totalsOf(out, ["balance"], "room"),
  };
}

/** گزارش روم شارژ: everything other than the room itself charged to rooms in the period. */
export async function roomCharges(db: DbOrTx, ctx: RestaurantContext, p: Period): Promise<Table> {
  assertCan(ctx, "analytics.view");
  const rows = await db
    .select({
      day: folioLines.businessDate,
      room: diningTables.label,
      stay: stays.number,
      guest: guestName,
      department: folioLines.department,
      description: folioLines.description,
      quantity: folioLines.quantity,
      amount: folioLines.amountCents,
      user: users.fullName,
    })
    .from(folioLines)
    .innerJoin(folios, eq(folios.id, folioLines.folioId))
    .innerJoin(stays, eq(stays.id, folios.stayId))
    .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
    .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
    .leftJoin(users, eq(users.id, folioLines.postedByUserId))
    .where(
      and(
        eq(folioLines.restaurantId, ctx.restaurant.id),
        eq(folioLines.kind, "charge"),
        notInArray(folioLines.department, ["room", "city_tax"]),
        isNull(folioLines.voidedAt),
        gte(folioLines.businessDate, p.from),
        lte(folioLines.businessDate, p.to),
        p.method ? eq(folioLines.department, p.method) : undefined,
      ),
    )
    .orderBy(asc(folioLines.businessDate), asc(diningTables.label))
    .limit(5000);
  const out = rows.map((r) => ({
    day: r.day,
    room: r.room ?? "",
    stay: r.stay,
    guest: r.guest,
    department: r.department,
    description: r.description,
    quantity: r.quantity,
    amount: r.amount,
    user: r.user ?? "",
  }));
  return {
    cols: [
      day("day"),
      txt("room"),
      ref("stay"),
      txt("guest"),
      code("department", "pms.dept"),
      txt("description"),
      int("quantity"),
      money("amount"),
      txt("user"),
    ],
    rows: out,
    totals: totalsOf(out, ["quantity", "amount"], "day"),
  };
}

/** گزارش جامع: the period at a glance, as label / value rows grouped in sections. */
export async function comprehensive(db: DbOrTx, ctx: RestaurantContext, p: Period) {
  assertCan(ctx, "analytics.view");
  const rid = ctx.restaurant.id;
  const tz = ctx.restaurant.timezone;
  const [audits, payments, moves, outstanding] = await Promise.all([
    db
      .select()
      .from(nightAudits)
      .where(
        and(
          eq(nightAudits.restaurantId, rid),
          gte(nightAudits.businessDate, p.from),
          lte(nightAudits.businessDate, p.to),
        ),
      ),
    db
      .select({
        method: folioLines.method,
        total: sql<number>`coalesce(sum(-${folioLines.amountCents}), 0)::bigint`.mapWith(Number),
      })
      .from(folioLines)
      .where(paymentLines(rid, p))
      .groupBy(folioLines.method),
    db
      .select({
        arrivals: sql<number>`count(*) filter (where ${stays.arrival} between ${p.from}::date and ${p.to}::date and ${stays.status} in ('in_house','checked_out'))::int`,
        departures: sql<number>`count(*) filter (where ${stays.departure} between ${p.from}::date and ${p.to}::date and ${stays.status} = 'checked_out')::int`,
        noShows: sql<number>`count(*) filter (where ${stays.arrival} between ${p.from}::date and ${p.to}::date and ${stays.status} = 'no_show')::int`,
        cancellations: sql<number>`count(*) filter (where ${stays.status} = 'cancelled' and (${stays.cancelledAt} at time zone ${tz})::date between ${p.from}::date and ${p.to}::date)::int`,
        booked: sql<number>`count(*) filter (where (${stays.createdAt} at time zone ${tz})::date between ${p.from}::date and ${p.to}::date)::int`,
      })
      .from(stays)
      .where(eq(stays.restaurantId, rid)),
    db
      .select({
        inHouse:
          sql<number>`coalesce(sum(${folioLines.amountCents}) filter (where ${stays.status} = 'in_house' and ${folios.accountId} is null), 0)::bigint`.mapWith(
            Number,
          ),
        cityLedger:
          sql<number>`coalesce(sum(${folioLines.amountCents}) filter (where ${folios.accountId} is not null), 0)::bigint`.mapWith(
            Number,
          ),
        departed:
          sql<number>`coalesce(sum(${folioLines.amountCents}) filter (where ${stays.status} in ('checked_out','no_show','cancelled') and ${folios.accountId} is null), 0)::bigint`.mapWith(
            Number,
          ),
      })
      .from(folioLines)
      .innerJoin(folios, eq(folios.id, folioLines.folioId))
      .leftJoin(stays, eq(stays.id, folios.stayId))
      .where(and(eq(folioLines.restaurantId, rid), isNull(folioLines.voidedAt))),
  ]);
  const rooms = audits.reduce((s, a) => s + a.roomsAvailable, 0);
  const sold = audits.reduce((s, a) => s + a.roomsSold, 0);
  const roomRev = audits.reduce((s, a) => s + a.roomRevenueCents, 0);
  const totalRev = audits.reduce((s, a) => s + a.totalRevenueCents, 0);
  const guests = audits.reduce((s, a) => s + a.guests, 0);
  const dept: Record<string, number> = {};
  for (const a of audits)
    for (const [k, v] of Object.entries(a.revenue ?? {})) dept[k] = (dept[k] ?? 0) + num(v);
  const m = moves[0];
  const o = outstanding[0];
  return {
    days: audits.length,
    figures: {
      roomsAvailable: rooms,
      roomsSold: sold,
      occupancyPct: rooms ? Math.round((sold / rooms) * 1000) / 10 : 0,
      adrCents: sold ? Math.round(roomRev / sold) : 0,
      revparCents: rooms ? Math.round(roomRev / rooms) : 0,
      trevparCents: rooms ? Math.round(totalRev / rooms) : 0,
      roomRevenueCents: roomRev,
      totalRevenueCents: totalRev,
      guestNights: guests,
    },
    revenue: Object.entries(dept)
      .filter(([, v]) => v)
      .sort((a, b) => b[1] - a[1]),
    payments: payments.filter((x) => x.total).map((x) => [x.method ?? "", x.total] as [string, number]),
    movements: m ?? { arrivals: 0, departures: 0, noShows: 0, cancellations: 0, booked: 0 },
    outstanding: o ?? { inHouse: 0, cityLedger: 0, departed: 0 },
  };
}

/** Occupancy and revenue of each closed day, for the charts. */
export async function chartSeries(db: DbOrTx, ctx: RestaurantContext, p: Period) {
  assertCan(ctx, "analytics.view");
  const rows = await db
    .select()
    .from(nightAudits)
    .where(
      and(
        eq(nightAudits.restaurantId, ctx.restaurant.id),
        gte(nightAudits.businessDate, p.from),
        lte(nightAudits.businessDate, p.to),
      ),
    )
    .orderBy(asc(nightAudits.businessDate));
  return rows.map((r) => ({
    day: r.businessDate,
    occupancy: r.roomsAvailable ? Math.round((r.roomsSold / r.roomsAvailable) * 1000) / 10 : 0,
    adrCents: r.roomsSold ? Math.round(r.roomRevenueCents / r.roomsSold) : 0,
    roomCents: r.roomRevenueCents,
    otherCents: r.totalRevenueCents - r.roomRevenueCents,
  }));
}

/** The registry the pages and the CSV export share. */
export const DESK_TABLES = {
  reservationList,
  cancellations,
  noShows: (db: DbOrTx, ctx: RestaurantContext, p: Period) => noShows(db, ctx, p),
  guaranteedNoShows: (db: DbOrTx, ctx: RestaurantContext, p: Period) => noShows(db, ctx, p, true),
  transactions,
  dailyCash,
  currencyReport,
  cashierSummary,
  pendingSettlement,
  creditAccounts,
  accountPerformance,
  planSales,
  bankReport,
  stayInvoiceList,
  dailySales,
  expectedGuests,
  individualGuests,
  paxSales,
  openFolios,
  inHouseDebtors,
  roomCharges,
} satisfies Record<string, (db: DbOrTx, ctx: RestaurantContext, p: Period) => Promise<Table>>;
export type DeskTableKey = keyof typeof DESK_TABLES;

/** The default period of a list: from `back` days ago to `ahead` days after the business day. */
export async function deskPeriod(db: DbOrTx, ctx: RestaurantContext, back: number, ahead: number) {
  const { businessDate } = await getPmsSettings(db, ctx.restaurant.id, ctx.restaurant.timezone);
  // Before the night audit the business day is still yesterday: the calendar day is covered too.
  const now = localDate(new Date(), ctx.restaurant.timezone);
  const first = businessDate < now ? businessDate : now;
  const last = businessDate > now ? businessDate : now;
  return { today: businessDate, from: addDays(first, -back), to: addDays(last, ahead) };
}
