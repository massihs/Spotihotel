import { and, asc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  diningTables,
  folioLines,
  folios,
  hotelGuests,
  hotelServices,
  minibarItems,
  pmsSettings,
  ratePlans,
  roomTypes,
  stayNights,
  stays,
} from "@/server/db/schema";
import { forbidden } from "@/server/errors";
import { listUserRestaurants, loadRestaurantContext, type RestaurantContext } from "@/server/tenancy";
import { keyFigures } from "./calc";
import { getPmsSettings } from "./setup";
import { ACTIVE_STAY, availabilityGrid } from "./stays";
import { syncLedger } from "@/server/modules/ledger/sync";
import { balanceSheet, incomeStatement } from "@/server/modules/ledger/reports";

/**
 * Hotel chain level (the organization's hotels): portfolio dashboard, central availability,
 * central reservation search and consolidated accounts. Only hotels the user manages (owner or
 * admin) are included; each is read with its own tenant context, so permissions stay per hotel.
 */
export async function chainContexts(db: DbOrTx, ctx: RestaurantContext) {
  if (ctx.role === "staff") throw forbidden("chain_managers_only");
  const mine = await listUserRestaurants(db, ctx.user.id);
  const hotels = mine.filter(
    (r) =>
      r.organizationId === ctx.restaurant.organizationId &&
      r.kind === "hotel" &&
      (r.role === "owner" || r.role === "admin"),
  );
  if (!hotels.some((h) => h.id === ctx.restaurant.id) && ctx.restaurant.kind === "hotel")
    return [ctx, ...(await Promise.all(hotels.map((h) => loadRestaurantContext(db, ctx.user, h.id))))];
  return Promise.all(hotels.map((h) => loadRestaurantContext(db, ctx.user, h.id)));
}

/** Today's figures of every hotel of the chain and the chain totals. */
export async function chainOverview(db: Database, ctx: RestaurantContext) {
  const contexts = await chainContexts(db, ctx);
  const rows = await Promise.all(
    contexts.map(async (c) => {
      const rid = c.restaurant.id;
      const { businessDate: day } = await getPmsSettings(db, rid, c.restaurant.timezone);
      const [[rooms], [tonight], [moves], [open]] = await Promise.all([
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(diningTables)
          .where(
            and(
              eq(diningTables.restaurantId, rid),
              eq(diningTables.kind, "room"),
              isNull(diningTables.deletedAt),
              ne(diningTables.housekeeping, "out_of_order"),
            ),
          ),
        db
          .select({
            sold: sql<number>`count(*)::int`,
            revenue: sql<number>`coalesce(sum(${stayNights.rateCents}),0)::bigint`.mapWith(Number),
          })
          .from(stayNights)
          .innerJoin(stays, eq(stays.id, stayNights.stayId))
          .where(
            and(
              eq(stays.restaurantId, rid),
              inArray(stays.status, [...ACTIVE_STAY]),
              eq(stayNights.day, day),
            ),
          ),
        db
          .select({
            arrivals: sql<number>`count(*) filter (where ${stays.status} in ('tentative','confirmed') and ${stays.arrival} <= ${day})::int`,
            departures: sql<number>`count(*) filter (where ${stays.status} = 'in_house' and ${stays.departure} <= ${day})::int`,
            inHouse: sql<number>`count(*) filter (where ${stays.status} = 'in_house')::int`,
            guests: sql<number>`coalesce(sum(${stays.adults} + ${stays.children}) filter (where ${stays.status} = 'in_house'),0)::int`,
          })
          .from(stays)
          .where(eq(stays.restaurantId, rid)),
        db
          .select({
            balance: sql<number>`coalesce(sum(${folioLines.amountCents}),0)::bigint`.mapWith(Number),
          })
          .from(folioLines)
          .innerJoin(folios, eq(folios.id, folioLines.folioId))
          .where(and(eq(folios.restaurantId, rid), eq(folios.status, "open"), isNull(folioLines.voidedAt))),
      ]);
      const r = rooms?.n ?? 0;
      const sold = tonight?.sold ?? 0;
      return {
        id: rid,
        name: c.restaurant.name,
        currency: c.restaurant.currency,
        businessDate: day,
        rooms: r,
        sold,
        roomRevenueCents: tonight?.revenue ?? 0,
        arrivals: moves?.arrivals ?? 0,
        departures: moves?.departures ?? 0,
        inHouse: moves?.inHouse ?? 0,
        guests: moves?.guests ?? 0,
        openBalanceCents: open?.balance ?? 0,
        ...keyFigures(r, sold, tonight?.revenue ?? 0),
      };
    }),
  );
  const rooms = rows.reduce((s, h) => s + h.rooms, 0);
  const sold = rows.reduce((s, h) => s + h.sold, 0);
  const revenue = rows.reduce((s, h) => s + h.roomRevenueCents, 0);
  return {
    hotels: rows,
    totals: {
      hotels: rows.length,
      rooms,
      sold,
      roomRevenueCents: revenue,
      arrivals: rows.reduce((s, h) => s + h.arrivals, 0),
      departures: rows.reduce((s, h) => s + h.departures, 0),
      guests: rows.reduce((s, h) => s + h.guests, 0),
      openBalanceCents: rows.reduce((s, h) => s + h.openBalanceCents, 0),
      ...keyFigures(rooms, sold, revenue),
    },
  };
}

/** Free rooms of every hotel and room type over the same nights (central reservations). */
export async function chainAvailability(db: Database, ctx: RestaurantContext, from: string, days: number) {
  const contexts = await chainContexts(db, ctx);
  return Promise.all(
    contexts.map(async (c) => ({
      id: c.restaurant.id,
      name: c.restaurant.name,
      ...(await availabilityGrid(db, c, from, days)),
    })),
  );
}

/** Finds a booking or a guest in any hotel of the chain (name, phone, document, number, reference). */
export async function chainSearch(db: DbOrTx, ctx: RestaurantContext, q: string) {
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return [];
  const contexts = await chainContexts(db, ctx);
  const byId = new Map(contexts.map((c) => [c.restaurant.id, c.restaurant.name]));
  const like = `%${term.replace(/[%_\\]/g, (x) => `\\${x}`)}%`;
  const num = /^\d{1,9}$/.test(term) ? Number(term) : null;
  const rows = await db
    .select({
      id: stays.id,
      restaurantId: stays.restaurantId,
      number: stays.number,
      status: stays.status,
      arrival: stays.arrival,
      departure: stays.departure,
      lastName: hotelGuests.lastName,
      firstName: hotelGuests.firstName,
      phone: hotelGuests.phone,
      room: diningTables.label,
      typeCode: roomTypes.code,
    })
    .from(stays)
    .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
    .innerJoin(roomTypes, eq(roomTypes.id, stays.roomTypeId))
    .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
    .where(
      and(
        inArray(stays.restaurantId, [...byId.keys()]),
        or(
          ilike(hotelGuests.lastName, like),
          ilike(hotelGuests.firstName, like),
          ilike(hotelGuests.phone, like),
          ilike(hotelGuests.documentNumber, like),
          ilike(stays.channelRef, like),
          num != null ? eq(stays.number, num) : undefined,
        ),
      ),
    )
    .orderBy(sql`${stays.arrival} desc`)
    .limit(100);
  return rows.map((r) => ({ ...r, hotel: byId.get(r.restaurantId) ?? "" }));
}

/**
 * Consolidated accounts of the chain: each hotel's income statement and balance sheet, then the
 * group totals by account code (the hotels share the same chart of accounts). Intra-group
 * transactions are not eliminated (hotels do not invoice each other).
 */
export async function chainFinancials(db: Database, ctx: RestaurantContext, from: string, to: string) {
  const contexts = (await chainContexts(db, ctx)).filter((c) => c.permissions.has("accounting.manage"));
  for (const c of contexts) await syncLedger(db, c.restaurant);
  const per = await Promise.all(
    contexts.map(async (c) => ({
      id: c.restaurant.id,
      name: c.restaurant.name,
      pl: await incomeStatement(db, c, from, to),
      bs: await balanceSheet(db, c, to),
    })),
  );
  const merge = (pick: (p: (typeof per)[number]) => { code: string; name: string; amount: number }[]) => {
    const map = new Map<
      string,
      { code: string; name: string; total: number; byHotel: Record<string, number> }
    >();
    for (const p of per)
      for (const r of pick(p)) {
        const cur = map.get(r.code) ?? { code: r.code, name: r.name, total: 0, byHotel: {} };
        cur.total += r.amount;
        cur.byHotel[p.id] = (cur.byHotel[p.id] ?? 0) + r.amount;
        map.set(r.code, cur);
      }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  };
  return {
    hotels: per.map((p) => ({
      id: p.id,
      name: p.name,
      revenue: p.pl.totals.revenue,
      expense: p.pl.totals.expense,
      net: p.pl.totals.net,
      assets: p.bs.totals.assets,
      liabilities: p.bs.totals.liabilities,
      equity: p.bs.totals.equity,
      balanced: p.bs.balanced,
    })),
    revenue: merge((p) => p.pl.revenue),
    expense: merge((p) => p.pl.expense),
    assets: merge((p) => p.bs.assets),
    liabilities: merge((p) => p.bs.liabilities),
    totals: {
      revenue: per.reduce((s, p) => s + p.pl.totals.revenue, 0),
      expense: per.reduce((s, p) => s + p.pl.totals.expense, 0),
      net: per.reduce((s, p) => s + p.pl.totals.net, 0),
      assets: per.reduce((s, p) => s + p.bs.totals.assets, 0),
      liabilities: per.reduce((s, p) => s + p.bs.totals.liabilities, 0),
      equity: per.reduce((s, p) => s + p.bs.totals.equity, 0),
    },
  };
}

/**
 * A new hotel of the chain starts with the configuration of an existing one: settings (taxes,
 * times, guest info), room types, rate plans, wellness services and minibar. Rooms, guests,
 * bookings and the books are never copied.
 */
export async function copyHotelSetup(tx: DbOrTx, fromId: string, toId: string) {
  const [s] = await tx.select().from(pmsSettings).where(eq(pmsSettings.restaurantId, fromId));
  if (s) {
    const {
      restaurantId: _r,
      businessDate: _b,
      nextStayNumber: _n,
      nextFolioNumber: _f,
      createdAt: _c,
      updatedAt: _u,
      ...copy
    } = s;
    await tx
      .insert(pmsSettings)
      .values({ ...copy, restaurantId: toId })
      .onConflictDoNothing();
  }
  const types = await tx
    .select()
    .from(roomTypes)
    .where(and(eq(roomTypes.restaurantId, fromId), isNull(roomTypes.deletedAt)))
    .orderBy(asc(roomTypes.sortOrder));
  for (const t of types) {
    const { id: _i, restaurantId: _r, createdAt: _c, updatedAt: _u, deletedAt: _d, ...copy } = t;
    await tx.insert(roomTypes).values({ ...copy, restaurantId: toId });
  }
  const plans = await tx
    .select()
    .from(ratePlans)
    .where(and(eq(ratePlans.restaurantId, fromId), isNull(ratePlans.deletedAt)));
  for (const p of plans) {
    const { id: _i, restaurantId: _r, createdAt: _c, updatedAt: _u, deletedAt: _d, ...copy } = p;
    await tx.insert(ratePlans).values({ ...copy, restaurantId: toId });
  }
  const services = await tx
    .select()
    .from(hotelServices)
    .where(and(eq(hotelServices.restaurantId, fromId), isNull(hotelServices.deletedAt)));
  for (const v of services) {
    const { id: _i, restaurantId: _r, createdAt: _c, updatedAt: _u, deletedAt: _d, ...copy } = v;
    await tx.insert(hotelServices).values({ ...copy, restaurantId: toId });
  }
  const items = await tx
    .select()
    .from(minibarItems)
    .where(and(eq(minibarItems.restaurantId, fromId), isNull(minibarItems.deletedAt)));
  for (const m of items) {
    const { id: _i, restaurantId: _r, createdAt: _c, updatedAt: _u, deletedAt: _d, ...copy } = m;
    await tx.insert(minibarItems).values({ ...copy, restaurantId: toId });
  }
  return {
    roomTypes: types.length,
    ratePlans: plans.length,
    services: services.length,
    minibar: items.length,
  };
}
