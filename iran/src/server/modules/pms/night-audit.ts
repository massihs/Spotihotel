import { dirtyStayoversAfterAudit } from "@/server/modules/hotel/hk-extra";
import { and, asc, desc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  diningTables,
  folioLines,
  hotelGuests,
  nightAudits,
  pmsSettings,
  stayNights,
  stays,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { addDays, keyFigures } from "./calc";
import { getPmsSettings } from "./setup";
import { postNights } from "./stays";
import { mainFolioOf, postLine } from "./folios";
import { releaseDueBlocks } from "./blocks";
import { syncLedger } from "@/server/modules/ledger/sync";

/** What still blocks closing the day: guests due out still in their room, arrivals not shown up. */
export async function auditPreflight(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "frontdesk.view");
  const rid = ctx.restaurant.id;
  const { businessDate } = await getPmsSettings(db, rid, ctx.restaurant.timezone);
  const cols = {
    id: stays.id,
    number: stays.number,
    lastName: hotelGuests.lastName,
    firstName: hotelGuests.firstName,
    room: diningTables.label,
    departure: stays.departure,
  };
  const [dueOut, noShows] = await Promise.all([
    db
      .select(cols)
      .from(stays)
      .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
      .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
      .where(
        and(eq(stays.restaurantId, rid), eq(stays.status, "in_house"), lte(stays.departure, businessDate)),
      ),
    db
      .select(cols)
      .from(stays)
      .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
      .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
      .where(
        and(
          eq(stays.restaurantId, rid),
          inArray(stays.status, ["tentative", "confirmed"]),
          lte(stays.arrival, businessDate),
        ),
      ),
  ]);
  return { businessDate, dueOut, noShows };
}

/**
 * Night audit (clôture de journée): charges tonight's room and city tax to every guest in house,
 * marks arrivals that never came as no-shows, freezes the day's figures, journals everything in
 * the general ledger, then moves the hotel to the next business day.
 *
 * Refused while a guest due to leave is still in house: check them out or extend their stay first.
 */
export async function runNightAudit(db: Database, ctx: RestaurantContext) {
  assertCan(ctx, "frontdesk.manage");
  const rid = ctx.restaurant.id;
  const result = await db.transaction(async (tx) => {
    // The settings row is the day's lock: two audits cannot run at once.
    await getPmsSettings(tx, rid, ctx.restaurant.timezone);
    const [locked] = await tx
      .select()
      .from(pmsSettings)
      .where(eq(pmsSettings.restaurantId, rid))
      .for("update");
    const settings = { ...locked!, businessDate: locked!.businessDate! };
    const day = settings.businessDate;

    const [dueOut] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(stays)
      .where(and(eq(stays.restaurantId, rid), eq(stays.status, "in_house"), lte(stays.departure, day)));
    if (dueOut!.n > 0) throw conflict("departures_pending", { count: dueOut!.n });

    // Arrivals of the day (or before) that never checked in.
    const noShows = await tx
      .update(stays)
      .set({ status: "no_show" })
      .where(
        and(
          eq(stays.restaurantId, rid),
          inArray(stays.status, ["tentative", "confirmed"]),
          lte(stays.arrival, day),
        ),
      )
      .returning({ id: stays.id, guarantee: stays.guarantee, number: stays.number });
    // A guaranteed booking that never came pays its first night (card, deposit or company).
    if (settings.chargeNoShows)
      for (const ns of noShows.filter((x) => x.guarantee !== "none")) {
        const [first] = await tx
          .select({ rateCents: stayNights.rateCents })
          .from(stayNights)
          .where(eq(stayNights.stayId, ns.id))
          .orderBy(asc(stayNights.day))
          .limit(1);
        if (!first?.rateCents) continue;
        const folio = await mainFolioOf(tx, rid, ns.id);
        await postLine(tx, rid, ctx.restaurant.timezone, {
          folioId: folio.id,
          kind: "charge",
          department: "room",
          description: "no_show_fee",
          unitCents: first.rateCents,
          amountCents: first.rateCents,
          taxRateBps: settings.roomTaxBps,
          sourceType: "no_show",
          sourceId: ns.id,
          businessDate: day,
        });
      }
    // Group blocks whose release date has come give their unpicked rooms back to sale.
    const released = await releaseDueBlocks(tx, rid, day);
    if (noShows.length)
      await tx.delete(stayNights).where(
        and(
          inArray(
            stayNights.stayId,
            noShows.map((s) => s.id),
          ),
          isNull(stayNights.postedAt),
        ),
      );

    const inHouse = await tx
      .select()
      .from(stays)
      .where(and(eq(stays.restaurantId, rid), eq(stays.status, "in_house")));
    for (const s of inHouse) await postNights(tx, ctx, s, settings, addDays(day, 1));

    const [rooms] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(diningTables)
      .where(
        and(
          eq(diningTables.restaurantId, rid),
          eq(diningTables.kind, "room"),
          isNull(diningTables.deletedAt),
          ne(diningTables.housekeeping, "out_of_order"),
        ),
      );
    const revenueRows = await tx
      .select({
        department: folioLines.department,
        total:
          sql<number>`coalesce(sum(${folioLines.amountCents} - ${folioLines.taxCents}),0)::bigint`.mapWith(
            Number,
          ),
      })
      .from(folioLines)
      .where(
        and(
          eq(folioLines.restaurantId, rid),
          eq(folioLines.businessDate, day),
          isNull(folioLines.voidedAt),
          inArray(folioLines.kind, ["charge", "adjustment"]),
        ),
      )
      .groupBy(folioLines.department);
    const [paid] = await tx
      .select({
        total: sql<number>`coalesce(sum(-${folioLines.amountCents}),0)::bigint`.mapWith(Number),
      })
      .from(folioLines)
      .where(
        and(
          eq(folioLines.restaurantId, rid),
          eq(folioLines.businessDate, day),
          isNull(folioLines.voidedAt),
          eq(folioLines.kind, "payment"),
        ),
      );
    const revenue = Object.fromEntries(revenueRows.map((r) => [r.department, r.total]));
    const roomRevenue = revenue.room ?? 0;
    const [audit] = await tx
      .insert(nightAudits)
      .values({
        restaurantId: rid,
        businessDate: day,
        roomsAvailable: rooms!.n,
        roomsSold: inHouse.length,
        guests: inHouse.reduce((s, x) => s + x.adults + x.children, 0),
        roomRevenueCents: roomRevenue,
        totalRevenueCents: revenueRows.reduce((s, r) => s + r.total, 0),
        paymentsCents: paid?.total ?? 0,
        noShows: noShows.length,
        revenue,
        closedByUserId: ctx.user.id,
      })
      .returning();
    await tx
      .update(pmsSettings)
      .set({ businessDate: addDays(day, 1) })
      .where(eq(pmsSettings.restaurantId, rid));
    await recordAudit(tx, {
      action: "pms.night_audit",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      metadata: {
        businessDate: day,
        roomsSold: inHouse.length,
        noShows: noShows.length,
        blocksReleased: released,
      },
    });
    return audit!;
  });
  // Journal the day in the general ledger (idempotent; also done before every finance report).
  await syncLedger(db, ctx.restaurant);
  // Daily cleaning: the rooms slept in go back to dirty for the new day.
  await dirtyStayoversAfterAudit(db, ctx).catch((e) => console.error("stayovers to dirty", e));
  return { ...result, ...keyFigures(result.roomsAvailable, result.roomsSold, result.roomRevenueCents) };
}

/** Past night audits (manager's report: occupancy, ADR, RevPAR, revenue per day). */
export async function listNightAudits(db: DbOrTx, ctx: RestaurantContext, limit = 60) {
  assertCan(ctx, "frontdesk.view");
  const rows = await db
    .select()
    .from(nightAudits)
    .where(eq(nightAudits.restaurantId, ctx.restaurant.id))
    .orderBy(desc(nightAudits.businessDate))
    .limit(Math.min(limit, 400));
  return rows.map((r) => ({ ...r, ...keyFigures(r.roomsAvailable, r.roomsSold, r.roomRevenueCents) }));
}
