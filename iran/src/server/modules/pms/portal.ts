import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database, DbOrTx } from "@/server/db/client";
import { folios, hotelGuests, hotelServices, stays } from "@/server/db/schema";
import type { GuestContext } from "@/server/modules/guest/sessions";
import { folioView } from "./folios";
import { listMinibar } from "./minibar";
import { getPmsSettings } from "./setup";
import { bookingsOfStay } from "./wellness";

/**
 * The guest portal behind a room's QR code. The stay is the one checked in to that room; it is
 * only shown to a phone that proved it belongs to the guest (their last name, remembered in a
 * signed cookie) so that someone scanning the code cannot read the bill or charge the room.
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

/** Accent- and case-insensitive comparison of a typed last name. */
export function sameName(typed: string, real: string) {
  const norm = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/[\s'’-]/g, "")
      .toLowerCase();
  return norm(typed).length >= 2 && norm(typed) === norm(real);
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
  if (!stayId) return { settings, services, minibar: [], folios: [], bookings: [] };
  const [minibar, folioIds, bookings] = await Promise.all([
    settings.minibarSelfService ? listMinibar(db, rid, true) : Promise.resolve([]),
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
