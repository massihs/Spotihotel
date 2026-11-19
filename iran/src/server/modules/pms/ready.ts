import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { diningTables, hotelGuests, outlets, stays } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { sms } from "@/server/infra/sms";
import { localDay } from "@/lib/period";
import { getFeatures } from "./features";
import { precheckinLink } from "./precheckin";

/**
 * "Your room is ready": a guest who arrives before the room is done follows its preparation on
 * the booking's private page, is offered the hotel café meanwhile, and gets a text the moment
 * housekeeping marks the room clean.
 */

export type Readiness = {
  state: "ready" | "cleaning" | "assigning";
  room: string | null;
  offerPct: number | null;
  cafe: string | null;
};

const READY = ["clean", "inspected"];

export async function readinessOf(
  db: DbOrTx,
  stay: { id: string; restaurantId: string; roomId: string | null; arrival: string; status: string },
  timeZone: string,
): Promise<Readiness | null> {
  if (!["tentative", "confirmed"].includes(stay.status)) return null;
  if (stay.arrival > localDay(new Date(), timeZone)) return null;
  const [features, room, cafe] = await Promise.all([
    getFeatures(db, stay.restaurantId),
    stay.roomId
      ? db
          .select({
            label: diningTables.label,
            housekeeping: diningTables.housekeeping,
            occupied: sql<boolean>`exists (select 1 from stays s where s.room_id = ${stay.roomId}
              and s.status = 'in_house' and s.id <> ${stay.id})`,
          })
          .from(diningTables)
          .where(eq(diningTables.id, stay.roomId))
          .then((r) => r[0])
      : Promise.resolve(undefined),
    db
      .select({ name: outlets.name })
      .from(outlets)
      .where(
        and(
          eq(outlets.restaurantId, stay.restaurantId),
          eq(outlets.kind, "cafe"),
          eq(outlets.isActive, true),
        ),
      )
      .limit(1)
      .then((r) => r[0]),
  ]);
  const ready = !!room && READY.includes(room.housekeeping) && !room.occupied;
  const offer = features.readyOffer.enabled && !ready ? features.readyOffer.pct : null;
  return {
    state: !room ? "assigning" : ready ? "ready" : "cleaning",
    room: room?.label ?? null,
    offerPct: offer || null,
    cafe: offer ? (cafe?.name ?? null) : null,
  };
}

/** After housekeeping marks a room clean: text today's arriving guest of that room, once. */
export async function notifyRoomReady(
  db: DbOrTx,
  restaurant: { id: string; name: string; timezone: string },
  roomId: string,
) {
  const today = localDay(new Date(), restaurant.timezone);
  const rows = await db
    .select({ id: stays.id, code: stays.code, phone: hotelGuests.phone, firstName: hotelGuests.firstName })
    .from(stays)
    .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
    .where(
      and(
        eq(stays.restaurantId, restaurant.id),
        eq(stays.roomId, roomId),
        eq(stays.arrival, today),
        inArray(stays.status, ["tentative", "confirmed"]),
        isNull(stays.readyNotifiedAt),
      ),
    );
  for (const r of rows) {
    if (!r.phone) continue;
    const [room] = await db
      .select({ label: diningTables.label })
      .from(diningTables)
      .where(eq(diningTables.id, roomId));
    try {
      await sms().send(
        r.phone,
        `${restaurant.name}: ${r.firstName ? `${r.firstName}، ` : ""}اتاق ${room?.label ?? ""} شما آماده است. ${precheckinLink(r.code)}`,
      );
    } catch (e) {
      console.error("[ready] sms failed", e instanceof Error ? e.message : e);
      continue;
    }
    await db
      .update(stays)
      .set({ readyNotifiedAt: new Date() })
      .where(and(eq(stays.id, r.id), isNull(stays.readyNotifiedAt)));
    await recordAudit(db, {
      action: "stay.ready_notified",
      restaurantId: restaurant.id,
      entityType: "stay",
      entityId: r.id,
      metadata: { room: room?.label },
    });
  }
}
