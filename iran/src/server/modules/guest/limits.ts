import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { guestBlocks, orders, restaurantSettings } from "@/server/db/schema";
import { conflict } from "@/server/errors";
import type { GuestContext } from "./sessions";

/** Orders a guest / a table may have waiting for the staff at the same time. */
export const MAX_PENDING_PER_GUEST = 2;
export const MAX_PENDING_PER_TABLE = 4;

export async function isGuestBlocked(db: DbOrTx, restaurantId: string, guestId: string) {
  const [row] = await db
    .select({ id: guestBlocks.id })
    .from(guestBlocks)
    .where(and(eq(guestBlocks.restaurantId, restaurantId), eq(guestBlocks.guestId, guestId)))
    .limit(1);
  return Boolean(row);
}

/** Before an order or a call: the table must be confirmed (when asked) and not flooded. */
export async function assertGuestMayAct(tx: DbOrTx, guest: GuestContext, what: "order" | "call") {
  if (!guest.session.confirmed) throw conflict("table_not_confirmed");
  if (what !== "order") return;
  const [row] = await tx
    .select({
      mine: sql<number>`count(*) filter (where ${orders.participantId} = ${guest.participant.id})`.mapWith(
        Number,
      ),
      all: sql<number>`count(*)`.mapWith(Number),
    })
    .from(orders)
    .where(
      and(
        eq(orders.tableSessionId, guest.session.id),
        inArray(orders.status, ["received", "pending_payment"]),
      ),
    );
  if ((row?.mine ?? 0) >= MAX_PENDING_PER_GUEST || (row?.all ?? 0) >= MAX_PENDING_PER_TABLE)
    throw conflict("too_many_pending");
}

/** Whether a table opened now by a scan must wait for a waiter. */
export async function scansNeedStaff(db: DbOrTx, restaurantId: string) {
  const [s] = await db
    .select({ need: restaurantSettings.guestOrdersNeedStaff })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, restaurantId));
  return Boolean(s?.need);
}
