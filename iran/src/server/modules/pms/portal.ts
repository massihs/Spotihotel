import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database, DbOrTx } from "@/server/db/client";
import { folios, hotelGuests, hotelServices, stays } from "@/server/db/schema";
import type { GuestContext } from "@/server/modules/guest/sessions";
import { folioView } from "./folios";
import { listMinibar } from "./minibar";
import { getPmsSettings } from "./setup";
import { bookingsOfStay } from "./wellness";

/**
 * The guest portal behind a room's QR code. Services, spa times, the minibar and the Wi-Fi are
 * open to anyone in the room; the bill and charging the room (spa booking, minibar) need a phone
 * that proved it belongs to the guest (their name, asked once and remembered in a signed cookie),
 * so that someone else scanning the code cannot read the bill or charge the room.
 */
export async function stayOfGuest(db: DbOrTx, guest: GuestContext) {
  if (guest.table.kind !== "room") return null;
  const [row] = await db
    .select({ stay: stays, guest: hotelGuests })
    .from(stays)
    .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
    .where(
      and(
        eq(stays.restaurantId, guest.restaurant.id),
        eq(stays.roomId, guest.table.id),
        eq(stays.status, "in_house"),
      ),
    )
    .limit(1);
  if (!row) return null;
  // The QR visit must have started after this guest's check-in (not a previous occupant's).
  if (row.stay.checkedInAt && guest.session.openedAt < new Date(row.stay.checkedInAt.getTime() - 60_000))
    return null;
  return row;
}

/**
 * The name a guest types to unlock their bill, compared loosely: accents, case, spaces, hyphens,
 * the half-space (ZWNJ) and the Arabic forms of Persian letters (ي/ی, ك/ک, ة/ه…) do not matter.
 */
function normName(s: string) {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[أإآ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/[\s'’\u200c\u200d_.-]/g, "")
    .toLowerCase();
}

/** Accent- and case-insensitive comparison of a typed last name. */
export function sameName(typed: string, real: string) {
  const t = normName(typed);
  return t.length >= 2 && t === normName(real);
}

/** The last name, or the full name in either order. */
export function nameMatches(typed: string, guest: { firstName: string | null; lastName: string }) {
  const first = guest.firstName ?? "";
  return (
    sameName(typed, guest.lastName) ||
    (!!first && (sameName(typed, `${first}${guest.lastName}`) || sameName(typed, `${guest.lastName}${first}`)))
  );
}

export async function portalData(db: Database, guest: GuestContext, stayId: string | null) {
  const rid = guest.restaurant.id;
  const settings = await getPmsSettings(db, rid, guest.restaurant.timezone);
  const services = await db
    .select()
    .from(hotelServices)
    .where(
      and(
        eq(hotelServices.restaurantId, rid),
        isNull(hotelServices.deletedAt),
        eq(hotelServices.active, true),
        eq(hotelServices.guestBookable, true),
      ),
    )
    .orderBy(asc(hotelServices.sortOrder), asc(hotelServices.name));
  // The minibar's list and prices are no secret: shown before the guest unlocks their bill.
  const minibar = settings.minibarSelfService ? await listMinibar(db, rid, true) : [];
  if (!stayId) return { settings, services, minibar, folios: [], bookings: [] };
  const [folioIds, bookings] = await Promise.all([
    db
      .select({ id: folios.id })
      .from(folios)
      .where(and(eq(folios.restaurantId, rid), eq(folios.stayId, stayId), isNull(folios.accountId)))
      .orderBy(asc(folios.number)),
    bookingsOfStay(db, rid, stayId),
  ]);
  const folioList = await Promise.all(folioIds.map((f) => folioView(db, rid, f.id)));
  return { settings, services, minibar, folios: folioList, bookings };
}
