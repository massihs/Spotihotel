import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import {
  diningTables,
  folioLines,
  folios,
  hotelAccounts,
  hotelGuests,
  ratePlans,
  restaurants,
  roomTypes,
  stays,
} from "@/server/db/schema";
import { notFound } from "@/server/errors";
import { addDays } from "@/server/modules/pms/calc";
import { getPmsSettings } from "@/server/modules/pms/setup";
import type { DeviceAuth } from "./service";

/** Format of the front desk copy: the desktop app refuses a newer one than it understands. */
export const FRONTDESK_VERSION = 1;
/** Arrivals kept in the copy: today and the next two days. */
const ARRIVAL_DAYS = 3;

/**
 * The front desk's emergency copy (downtime report) for the hotel's desktop app: rooms with their
 * state, guests in house with their identity and balance, today's departures and the coming
 * arrivals. Refreshed every few minutes while online, it lets the reception carry on when the
 * internet (or the website) is down: who is in which room, who arrives, what each guest owes, and
 * the police register to print.
 *
 * Only the hotel's own linked PCs get it (device token), and the app keeps it encrypted on disk.
 */
export async function frontdeskSnapshot(db: DbOrTx, auth: DeviceAuth) {
  const rid = auth.restaurantId;
  const [hotel] = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      kind: restaurants.kind,
      currency: restaurants.currency,
      timezone: restaurants.timezone,
      defaultLocale: restaurants.defaultLocale,
    })
    .from(restaurants)
    .where(eq(restaurants.id, rid));
  if (!hotel || hotel.kind !== "hotel") throw notFound("not_hotel");
  const { businessDate: day } = await getPmsSettings(db, rid, hotel.timezone);
  const lastArrival = addDays(day, ARRIVAL_DAYS - 1);

  const [rooms, rows] = await Promise.all([
    db
      .select({
        id: diningTables.id,
        label: diningTables.label,
        number: diningTables.number,
        zone: diningTables.zone,
        housekeeping: diningTables.housekeeping,
        typeCode: roomTypes.code,
        typeName: roomTypes.name,
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
        status: stays.status,
        roomId: stays.roomId,
        roomLabel: diningTables.label,
        typeCode: roomTypes.code,
        arrival: stays.arrival,
        departure: stays.departure,
        adults: stays.adults,
        children: stays.children,
        eta: stays.eta,
        guarantee: stays.guarantee,
        source: stays.source,
        notes: stays.notes,
        precheckin: sql<boolean>`${stays.precheckinAt} is not null`,
        plan: ratePlans.code,
        mealPlan: ratePlans.mealPlan,
        account: hotelAccounts.name,
        firstName: hotelGuests.firstName,
        lastName: hotelGuests.lastName,
        fatherName: hotelGuests.fatherName,
        phone: hotelGuests.phone,
        nationality: hotelGuests.nationality,
        documentType: hotelGuests.documentType,
        documentNumber: hotelGuests.documentNumber,
        birthDate: hotelGuests.birthDate,
        vip: hotelGuests.vip,
      })
      .from(stays)
      .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
      .innerJoin(roomTypes, eq(roomTypes.id, stays.roomTypeId))
      .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
      .leftJoin(ratePlans, eq(ratePlans.id, stays.ratePlanId))
      .leftJoin(hotelAccounts, eq(hotelAccounts.id, stays.accountId))
      .where(
        and(
          eq(stays.restaurantId, rid),
          or(
            eq(stays.status, "in_house"),
            and(
              inArray(stays.status, ["confirmed", "tentative"]),
              gte(stays.arrival, day),
              lte(stays.arrival, lastArrival),
            ),
            // Left today: still useful to answer "has room 204 gone?".
            and(eq(stays.status, "checked_out"), eq(stays.departure, day)),
          ),
        ),
      )
      .orderBy(asc(stays.arrival), asc(diningTables.label), asc(stays.number)),
  ]);

  // What each stay owes: the live lines of its open folios.
  const ids = rows.map((r) => r.id);
  const balances = ids.length
    ? await db
        .select({
          stayId: folios.stayId,
          cents: sql<number>`coalesce(sum(${folioLines.amountCents}), 0)::bigint`.mapWith(Number),
        })
        .from(folioLines)
        .innerJoin(folios, eq(folios.id, folioLines.folioId))
        .where(and(inArray(folios.stayId, ids), isNull(folioLines.voidedAt)))
        .groupBy(folios.stayId)
    : [];
  const owed = new Map(balances.map((b) => [b.stayId, b.cents]));

  const list = rows.map(({ id, ...r }) => ({ ...r, balanceCents: owed.get(id) ?? 0 }));
  const occupant = new Map(list.filter((s) => s.status === "in_house" && s.roomId).map((s) => [s.roomId, s]));
  return {
    version: FRONTDESK_VERSION,
    generatedAt: new Date().toISOString(),
    hotel: {
      name: hotel.name,
      currency: hotel.currency,
      timezone: hotel.timezone,
      defaultLocale: hotel.defaultLocale,
    },
    businessDate: day,
    rooms: rooms.map((r) => {
      const s = occupant.get(r.id);
      return {
        ...r,
        occupiedBy: s ? `${s.firstName} ${s.lastName}`.trim() : null,
        stayNumber: s?.number ?? null,
        departure: s?.departure ?? null,
      };
    }),
    inHouse: list.filter((s) => s.status === "in_house"),
    arrivals: list.filter((s) => s.status === "confirmed" || s.status === "tentative"),
    departures: list.filter(
      (s) => s.departure === day && (s.status === "in_house" || s.status === "checked_out"),
    ),
  };
}

export type FrontdeskSnapshot = Awaited<ReturnType<typeof frontdeskSnapshot>>;
