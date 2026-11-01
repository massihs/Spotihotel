import { and, asc, eq, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  diningTables,
  guests,
  orders,
  restaurantSettings,
  restaurants,
  sessionParticipants,
  tableSessions,
} from "@/server/db/schema";
import { isUniqueViolation } from "@/server/db/errors";
import { recordAudit } from "@/server/audit";
import { emit, topics } from "@/server/infra/realtime";
import { isUuid } from "@/lib/ids";
import { resolveQrToken } from "@/server/modules/tables/service";

/** Orders that keep a table "busy": not cancelled and not fully paid. */
async function hasOpenBusiness(tx: DbOrTx, sessionId: string) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(orders)
    .where(
      and(
        eq(orders.tableSessionId, sessionId),
        sql`${orders.status} <> 'cancelled'`,
        sql`${orders.paymentStatus} in ('unpaid', 'pending')`,
      ),
    );
  return (row?.n ?? 0) > 0;
}

/**
 * Returns the open session of a table, opening one if needed.
 * - A session idle for longer than the restaurant's auto-close delay, with nothing left to pay,
 *   is closed lazily and a fresh one is opened (new group at the table).
 * - Concurrent first scans are safe: the partial unique index allows a single open session;
 *   the loser of the race simply reads the winner's session.
 */
export async function openOrJoinTableSession(db: Database, restaurantId: string, tableId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(tableSessions)
          .where(and(eq(tableSessions.tableId, tableId), eq(tableSessions.status, "open")))
          .for("update");
        if (current) {
          const [settings] = await tx
            .select({ autoClose: restaurantSettings.sessionAutoCloseMinutes })
            .from(restaurantSettings)
            .where(eq(restaurantSettings.restaurantId, restaurantId));
          const idleMs = Date.now() - current.lastActivityAt.getTime();
          const expired = settings?.autoClose != null && idleMs > settings.autoClose * 60_000;
          if (!expired || (await hasOpenBusiness(tx, current.id))) return current;
          await tx
            .update(tableSessions)
            .set({ status: "closed", closedAt: new Date(), closedReason: "auto" })
            .where(eq(tableSessions.id, current.id));
          await recordAudit(tx, {
            action: "table_session.auto_closed",
            actorType: "system",
            restaurantId,
            entityType: "table_session",
            entityId: current.id,
          });
        }
        const [created] = await tx.insert(tableSessions).values({ restaurantId, tableId }).returning();
        await emit(tx, { topic: topics.restaurant(restaurantId), type: "session.opened", data: { tableId } });
        return created!;
      });
    } catch (e) {
      if (isUniqueViolation(e, "table_sessions_one_open_per_table_uq")) continue; // another scan won the race
      throw e;
    }
  }
  throw new Error("Could not open a table session");
}

/** Joins the session as this device; the same device always gets the same participant. */
export async function joinSession(
  db: Database,
  session: { id: string; restaurantId: string },
  guestId: string,
) {
  await db.insert(guests).values({ id: guestId }).onConflictDoNothing();
  for (let attempt = 0; attempt < 5; attempt++) {
    const [existing] = await db
      .select()
      .from(sessionParticipants)
      .where(
        and(eq(sessionParticipants.tableSessionId, session.id), eq(sessionParticipants.guestId, guestId)),
      );
    if (existing) return existing;
    try {
      const [p] = await db
        .insert(sessionParticipants)
        .values({
          restaurantId: session.restaurantId,
          tableSessionId: session.id,
          guestId,
          seq: sql`(select coalesce(max(seq), 0) + 1 from session_participants where table_session_id = ${session.id})`,
        })
        .returning();
      // Floor view shows the number of people per table.
      await emit(db, {
        topic: topics.restaurant(session.restaurantId),
        type: "session.opened",
        data: { sessionId: session.id },
      });
      return p!;
    } catch (e) {
      // Two devices joining at the same instant may compute the same seq: retry.
      if (isUniqueViolation(e)) continue;
      throw e;
    }
  }
  throw new Error("Could not join the table session");
}

/** Full QR flow: token → table → open session → participant for this device. */
export async function enterTableByQr(db: Database, qrToken: string, guestId: string) {
  const resolved = await resolveQrToken(db, qrToken);
  if (!resolved) return null;
  const session = await openOrJoinTableSession(db, resolved.restaurant.id, resolved.table.id);
  const participant = await joinSession(db, session, guestId);
  await touchSession(db, session.id);
  return { ...resolved, session, participant };
}

export async function touchSession(db: DbOrTx, sessionId: string) {
  await db.update(tableSessions).set({ lastActivityAt: new Date() }).where(eq(tableSessions.id, sessionId));
}

export type GuestContext = {
  guestId: string;
  participant: { id: string; seq: number; displayName: string | null };
  session: { id: string; openedAt: Date };
  table: { id: string; label: string };
  restaurant: {
    id: string;
    name: string;
    slug: string;
    logoKey: string | null;
    currency: string;
    timezone: string;
    defaultLocale: string;
    pricesIncludeTax: boolean;
    enabledLocales: string[];
  };
};

/**
 * Loads the guest context from the (already verified) cookie values.
 * Returns null when the participant does not belong to this device, the session is
 * closed, the table/QR was disabled or the restaurant suspended.
 */
export async function loadGuestContext(
  db: DbOrTx,
  guestId: string,
  participantId: string,
): Promise<GuestContext | null> {
  if (!isUuid(guestId) || !isUuid(participantId)) return null;
  const [row] = await db
    .select({
      participant: {
        id: sessionParticipants.id,
        seq: sessionParticipants.seq,
        displayName: sessionParticipants.displayName,
        guestId: sessionParticipants.guestId,
      },
      session: { id: tableSessions.id, openedAt: tableSessions.openedAt, status: tableSessions.status },
      table: {
        id: diningTables.id,
        label: diningTables.label,
        qrEnabled: diningTables.qrEnabled,
        deletedAt: diningTables.deletedAt,
      },
      restaurant: {
        id: restaurants.id,
        name: restaurants.name,
        slug: restaurants.slug,
        logoKey: restaurants.logoKey,
        currency: restaurants.currency,
        timezone: restaurants.timezone,
        defaultLocale: restaurants.defaultLocale,
        status: restaurants.status,
        pricesIncludeTax: restaurantSettings.pricesIncludeTax,
        enabledLocales: restaurantSettings.enabledLocales,
      },
    })
    .from(sessionParticipants)
    .innerJoin(tableSessions, eq(tableSessions.id, sessionParticipants.tableSessionId))
    .innerJoin(diningTables, eq(diningTables.id, tableSessions.tableId))
    .innerJoin(restaurants, eq(restaurants.id, tableSessions.restaurantId))
    .innerJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .where(eq(sessionParticipants.id, participantId))
    .limit(1);

  if (!row) return null;
  if (row.participant.guestId !== guestId) return null; // cookie of another device
  if (row.session.status !== "open") return null;
  if (!row.table.qrEnabled || row.table.deletedAt) return null;
  if (row.restaurant.status !== "active") return null;

  const { status: _s, ...restaurant } = row.restaurant;
  return {
    guestId,
    participant: {
      id: row.participant.id,
      seq: row.participant.seq,
      displayName: row.participant.displayName,
    },
    session: { id: row.session.id, openedAt: row.session.openedAt },
    table: { id: row.table.id, label: row.table.label },
    restaurant,
  };
}

export async function listSessionParticipants(db: DbOrTx, sessionId: string) {
  return db
    .select({
      id: sessionParticipants.id,
      seq: sessionParticipants.seq,
      displayName: sessionParticipants.displayName,
    })
    .from(sessionParticipants)
    .where(eq(sessionParticipants.tableSessionId, sessionId))
    .orderBy(asc(sessionParticipants.seq));
}

export async function renameParticipant(db: DbOrTx, ctx: GuestContext, displayName: string) {
  const name = displayName.trim().replace(/\s+/g, " ").slice(0, 24);
  await db
    .update(sessionParticipants)
    .set({ displayName: name === "" ? null : name })
    .where(eq(sessionParticipants.id, ctx.participant.id));
  return name || null;
}
