import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { restaurants, stays } from "@/server/db/schema";
import { bulkCreateTables, listTables } from "@/server/modules/tables/service";
import {
  assignRoomType,
  createRatePlan,
  createRoomType,
  getPmsSettings,
  updatePmsSettings,
} from "@/server/modules/pms/setup";
import { cancelStay, checkIn, createStay, getStay } from "@/server/modules/pms/stays";
import { postCharge, postPayment, transferFolioToAccount } from "@/server/modules/pms/folios";
import { saveAccount } from "@/server/modules/pms/guests";
import { addDays } from "@/server/modules/pms/calc";
import {
  DESK_TABLES,
  chartSeries,
  comprehensive,
  roomRack,
  type Table,
} from "@/server/modules/pms/desk-reports";
import {
  closeShift,
  currentShift,
  openShift,
  saveCashierSettings,
  shiftReport,
} from "@/server/modules/pms/cashier";
import { createOwnerWithRestaurant } from "../helpers/factories";

async function hotel() {
  const { ctx } = await createOwnerWithRestaurant("Desk Hotel", { plan: "enterprise" });
  await db.update(restaurants).set({ kind: "hotel" }).where(eq(restaurants.id, ctx.restaurant.id));
  const h = { ...ctx, restaurant: { ...ctx.restaurant, kind: "hotel" as const } };
  await bulkCreateTables(db, h, { from: 101, to: 104, kind: "room" });
  await updatePmsSettings(db, h, {
    checkInTime: "14:00",
    checkOutTime: "12:00",
    roomTaxBps: 0,
    serviceTaxBps: 0,
    cityTaxCents: 0,
    autoChargeRoomService: true,
    minibarSelfService: true,
    chargeNoShows: true,
    channelCommissions: {},
  });
  const dbl = await createRoomType(db, h, {
    code: "DBL",
    name: "Double",
    baseOccupancy: 2,
    maxOccupancy: 3,
    baseRateCents: 100_000,
  });
  const rooms = (await listTables(db, h)).filter((r) => r.kind === "room");
  await assignRoomType(
    db,
    h,
    rooms.map((r) => r.id),
    dbl.id,
  );
  await createRatePlan(db, h, { code: "BB", name: "Breakfast", mealPlan: "BB", isDefault: true });
  const { businessDate: today } = await getPmsSettings(db, h.restaurant.id, h.restaurant.timezone);
  return { h, dbl, today };
}

const guest = (lastName: string) => ({
  firstName: "Sara",
  lastName,
  nationality: "IR",
  documentType: "id_card" as const,
  documentNumber: "0012345679",
});
const total = (t: Table, key: string) => Number(t.totals?.[key] ?? 0);

describe("front office lists, cashier and hotel reports", () => {
  it("lists bookings, cancellations, debtors and transactions, and closes a cash shift", async () => {
    const { h, dbl, today } = await hotel();
    const period = { from: addDays(today, -5), to: addDays(today, 10) };

    // A company account and a guest of that company in house.
    const acme = await saveAccount(db, h, null, {
      kind: "company",
      name: "Acme",
      creditLimitCents: 5_000_000,
    });
    const a = await createStay(db, h, {
      guest: guest("Ahmadi"),
      roomTypeId: dbl.id,
      arrival: today,
      departure: addDays(today, 2),
      adults: 2,
    });
    await checkIn(db, h, a.id);
    const folioA = (await getStay(db, h, a.id)).folios[0]!;
    await postCharge(db, h, folioA.id, { department: "minibar", description: "Water", unitCents: 30_000 });
    // A second guest, an individual, books ahead; a third cancels.
    const b = await createStay(db, h, {
      guest: guest("Bahrami"),
      roomTypeId: dbl.id,
      arrival: addDays(today, 3),
      departure: addDays(today, 5),
    });
    const c = await createStay(db, h, {
      guest: guest("Karimi"),
      roomTypeId: dbl.id,
      arrival: addDays(today, 4),
      departure: addDays(today, 6),
    });
    await cancelStay(db, h, c.id, { reason: "Change of plans", feeCents: 20_000 });

    // The cashier: a shift, a payment in rials and one in dollars.
    await saveCashierSettings(db, h, {
      deskFloatCents: 50_000,
      currencies: [{ code: "USD", rateCents: 600_000 }],
    });
    await openShift(db, h, {});
    await expect(openShift(db, h, {})).rejects.toMatchObject({ message: "shift_already_open" });
    await postPayment(db, h, folioA.id, { amountCents: 10_000, method: "cash" });
    await postPayment(db, h, folioA.id, {
      amountCents: 1,
      method: "cash",
      currency: "USD",
      foreignCents: 500,
    });
    await expect(
      postPayment(db, h, folioA.id, { amountCents: 1, method: "cash", currency: "EUR", foreignCents: 500 }),
    ).rejects.toMatchObject({ message: "currency_not_accepted" });
    const live = (await currentShift(db, h))!;
    expect(live.takings.byMethod.cash).toBe(10_000);
    expect(live.takings.foreign.USD).toBe(500);
    expect(live.expectedCashCents).toBe(60_000);
    const closed = await closeShift(db, h, { countedCashCents: 59_000, countedForeign: { USD: 500 } });
    expect(closed.differenceCents).toBe(-1_000);
    const handover = await shiftReport(db, h, { from: today, to: today });
    expect(handover.rows[0]).toMatchObject({ expected: 60_000, counted: 59_000, difference: -1_000 });
    expect(await currentShift(db, h)).toBeNull();

    // Reservations.
    const list = await DESK_TABLES.reservationList(db, h, period);
    expect(list.rows.map((r) => r.number).sort()).toEqual([a.number, b.number].sort());
    const cancelled = await DESK_TABLES.cancellations(db, h, { from: today, to: today });
    expect(cancelled.rows).toEqual([expect.objectContaining({ number: c.number, fee: 20_000 })]);
    expect((await DESK_TABLES.noShows(db, h, period)).rows).toEqual([]);

    // Cashier lists.
    const tx = await DESK_TABLES.transactions(db, h, { from: today, to: today });
    expect(tx.rows).toHaveLength(2);
    expect(total(tx, "amount")).toBe(10_000 + 3_000_000);
    expect(tx.rows.find((r) => r.foreign)?.foreign).toBe("5 USD");
    const found = await DESK_TABLES.transactions(db, h, { from: today, to: today, q: "Ahmadi" });
    expect(found.rows).toHaveLength(2);
    expect((await DESK_TABLES.transactions(db, h, { from: today, to: today, q: "Nobody" })).rows).toEqual([]);
    const cash = await DESK_TABLES.dailyCash(db, h, { from: today, to: today });
    expect(total(cash, "received")).toBe(10_000);
    const fx = await DESK_TABLES.currencyReport(db, h, { from: today, to: today });
    expect(fx.rows[0]).toMatchObject({ currency: "USD", value: 3_000_000 });
    const summary = await DESK_TABLES.cashierSummary(db, h, { from: today, to: today });
    expect(total(summary, "total")).toBe(3_010_000);

    // In-house debtors: Ahmadi paid more than the minibar: no debt; Bahrami is not in.
    expect((await DESK_TABLES.inHouseDebtors(db, h, period)).rows).toEqual([]);
    const charges = await DESK_TABLES.roomCharges(db, h, { from: today, to: today });
    expect(charges.rows).toEqual([expect.objectContaining({ department: "minibar", amount: 30_000 })]);

    // Transferred to the company: the account owes, the open-folios list shows it.
    await postCharge(db, h, folioA.id, { department: "spa", description: "Massage", unitCents: 3_500_000 });
    await transferFolioToAccount(db, h, folioA.id, acme.id);
    const accounts = await DESK_TABLES.creditAccounts(db, h, period);
    const acmeRow = accounts.rows.find((r) => r.name === "Acme")!;
    expect(Number(acmeRow.balance)).toBeGreaterThan(0);
    expect(Number(acmeRow.available)).toBe(5_000_000 - Number(acmeRow.balance));
    const open = await DESK_TABLES.openFolios(db, h, period);
    expect(open.rows.some((r) => r.kind === "account")).toBe(true);

    // Expected guests and rack.
    const expected = await DESK_TABLES.expectedGuests(db, h, period);
    expect(expected.rows.map((r) => r.number)).toEqual([b.number]);
    const rack = await roomRack(db, h);
    expect(rack.rooms).toHaveLength(4);
    expect(rack.counts.occupied + rack.counts.departing).toBe(1);

    // Reports read from closed days and nights: empty but well-formed without a night audit.
    for (const key of [
      "planSales",
      "bankReport",
      "stayInvoiceList",
      "dailySales",
      "individualGuests",
      "paxSales",
      "accountPerformance",
      "pendingSettlement",
      "guaranteedNoShows",
    ] as const) {
      const t = await DESK_TABLES[key](db, h, period);
      expect(Array.isArray(t.rows)).toBe(true);
      expect(t.cols.length).toBeGreaterThan(2);
    }
    const all = await comprehensive(db, h, period);
    expect(all.payments.length).toBeGreaterThan(0);
    expect(all.movements.cancellations).toBe(1);
    expect(await chartSeries(db, h, period)).toEqual([]);

    // A guest who left without paying shows in "pending settlement".
    await db.update(stays).set({ status: "checked_out" }).where(eq(stays.id, b.id));
    const fB = (await getStay(db, h, b.id)).folios[0]!;
    await postCharge(db, h, fB.id, { department: "misc", description: "Late", unitCents: 7_000 });
    const pending = await DESK_TABLES.pendingSettlement(db, h, period);
    // …and so does the cancellation whose fee is still unpaid.
    expect(pending.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ number: b.number, balance: 7_000 }),
        expect.objectContaining({ number: c.number, balance: 20_000, status: "cancelled" }),
      ]),
    );
    expect(pending.rows).toHaveLength(2);
  });
});
