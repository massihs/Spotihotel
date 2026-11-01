import { and, eq, gt, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { notifications, tableSessions } from "@/server/db/schema";
import { assertGuestMayAct } from "./limits";
import { emit, topics } from "@/server/infra/realtime";
import { conflict, validation } from "@/server/errors";
import { guestCallsOf, notifyTeam } from "@/server/modules/team/sections";
import type { GuestContext } from "./sessions";
import { openRequest } from "@/server/modules/hotel/requests";

const COOLDOWN_MS = 45_000;

/**
 * A guest calls the staff from the table (فراخوان گارسون) with one of the bell's options the
 * restaurant offers (waiter, the bill, water, or its own: "charcoal for the hookah"…). The call
 * rings the section the option is routed to. One call per guest every 45 seconds.
 */
export async function callWaiter(
  db: Database,
  guest: GuestContext,
  raw: string,
  now = new Date(),
  rawNote: string | null = null,
) {
  const rid = guest.restaurant.id;
  const option = (await guestCallsOf(db, rid, { room: guest.table.kind === "room" })).find(
    (o) => o.key === raw,
  );
  if (!option) throw validation("invalid_call");
  const kind = option.key;
  const room = guest.table.kind === "room";
  const note = room ? rawNote?.trim().slice(0, 280) || null : null;
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select({ confirmedAt: tableSessions.confirmedAt })
      .from(tableSessions)
      .where(eq(tableSessions.id, guest.session.id));
    await assertGuestMayAct(
      tx,
      { ...guest, session: { ...guest.session, confirmed: session?.confirmedAt != null } },
      "call",
    );
    const [recent] = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.restaurantId, rid),
          eq(notifications.type, "waiter.call"),
          sql`${notifications.payload}->>'participantId' = ${guest.participant.id}`,
          gt(notifications.createdAt, new Date(now.getTime() - COOLDOWN_MS)),
        ),
      )
      .limit(1);
    if (recent) throw conflict("too_soon");
    // In a hotel room the call is also a request the front desk tracks until it is done.
    const requestId = room
      ? await openRequest(tx, {
          restaurantId: rid,
          tableId: guest.table.id,
          placeLabel: guest.table.label,
          kind,
          label: option.label,
          note,
        })
      : null;
    const sections = await notifyTeam(
      tx,
      {
        restaurantId: rid,
        type: "waiter.call",
        payload: {
          tableLabel: guest.table.label,
          ...(guest.table.kind === "room" ? { place: "room" } : {}),
          kind,
          ...(option.label ? { label: option.label } : {}),
          ...(note ? { note } : {}),
          ...(requestId ? { requestId } : {}),
          participantId: guest.participant.id,
        },
      },
      { sectionId: option.sectionId },
    );
    await emit(tx, {
      topic: topics.restaurant(rid),
      type: "waiter.called",
      data: {
        tableLabel: guest.table.label,
        tableId: guest.table.id,
        ...(guest.table.kind === "room" ? { place: "room" } : {}),
        kind,
        ...(option.label ? { label: option.label } : {}),
        ...(note ? { note } : {}),
        ...(sections ? { sections } : {}),
      },
    });
  });
}
