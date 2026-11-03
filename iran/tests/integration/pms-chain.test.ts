import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { folioLines, journalLines, ledgerAccounts, restaurants, stays } from "@/server/db/schema";
import { bulkCreateTables, listTables } from "@/server/modules/tables/service";
import {
  assignRoomType,
  createRatePlan,
  createRoomType,
  getPmsSettings,
  updatePmsSettings,
} from "@/server/modules/pms/setup";
import {
  availabilityGrid,
  checkIn,
  checkOut,
  createStay,
  getStay,
  quoteStay,
} from "@/server/modules/pms/stays";
import { postPayment } from "@/server/modules/pms/folios";
import { runNightAudit } from "@/server/modules/pms/night-audit";
import { createBlock, getBlock, pickupRooming } from "@/server/modules/pms/blocks";
import { cancellationFee, channelMix, forecast, savePricingRule } from "@/server/modules/pms/revenue";
import { precheckinView, submitPrecheckin } from "@/server/modules/pms/precheckin";
import { chainFinancials, chainOverview, chainSearch } from "@/server/modules/pms/chain";
import { createBranch } from "@/server/modules/branches/service";
import { addDays } from "@/server/modules/pms/calc";
import { syncLedger } from "@/server/modules/ledger/sync";
import { trialBalance } from "@/server/modules/ledger/reports";
import {
  cashierReport,
  chequeRegister,
  paySupplier,
  payablesAging,
  setChequeStatus,
} from "@/server/modules/ledger/finance";
import { createPurchase, createStockItem, createSupplier } from "@/server/modules/inventory/service";
import { loadRestaurantContext } from "@/server/tenancy";
import { createOwnerWithRestaurant } from "../helpers/factories";

const withCheck = (nine: string) => {
  const sum = nine.split("").reduce((s, d, i) => s + Number(d) * (10 - i), 0);
  const r = sum % 11;
  return nine + String(r < 2 ? r : 11 - r);
};

async function hotel(rooms = 4) {
  const { ctx, sessionUser } = await createOwnerWithRestaurant("Chain Hotel", { plan: "enterprise" });
  await db.update(restaurants).set({ kind: "hotel" }).where(eq(restaurants.id, ctx.restaurant.id));
  const h = { ...ctx, restaurant: { ...ctx.restaurant, kind: "hotel" as const } };
  await bulkCreateTables(db, h, { from: 101, to: 100 + rooms, kind: "room" });
  await updatePmsSettings(db, h, {
    checkInTime: "14:00",
    checkOutTime: "12:00",
    roomTaxBps: 1000,
    serviceTaxBps: 1000,
    cityTaxCents: 0,
    autoChargeRoomService: true,
    minibarSelfService: true,
    chargeNoShows: true,
    channelCommissions: { snapptrip: 1500 },
  });
  const dbl = await createRoomType(db, h, {
    code: "DBL",
    name: "Double",
    baseOccupancy: 2,
    maxOccupancy: 2,
    baseRateCents: 10_000,
  });
  const list = (await listTables(db, h)).filter((r) => r.kind === "room");
  await assignRoomType(
    db,
    h,
    list.map((r) => r.id),
    dbl.id,
  );
  const { businessDate: today } = await getPmsSettings(db, h.restaurant.id, h.restaurant.timezone);
  return { h, dbl, today, sessionUser };
}

const balanceOf = async (restaurantId: string, key: string) => {
  const [a] = await db
    .select({ id: ledgerAccounts.id })
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.restaurantId, restaurantId), eq(ledgerAccounts.systemKey, key)));
  const rows = await db.select().from(journalLines).where(eq(journalLines.accountId, a!.id));
  return rows.reduce((s, l) => s + l.debitCents - l.creditCents, 0);
};

describe("hotel chain PMS", () => {
  it("holds group blocks, overbooks within limits, prices on demand, charges no-shows", async () => {
    const { h, dbl, today } = await hotel(4);
    // A tour holds 3 of the 4 doubles for 2 nights.
    const block = await createBlock(db, h, {
      name: "Tour Isfahan",
      arrival: today,
      departure: addDays(today, 2),
      releaseDate: today,
      rateCents: 8_000,
      rooms: [{ roomTypeId: dbl.id, rooms: 3 }],
    });
    let grid = await availabilityGrid(db, h, today, 2);
    expect(grid.types[0]!.days.map((d) => [d.free, d.blocked])).toEqual([
      [1, 3],
      [1, 3],
    ]);
    // One room left for everybody else; the second is refused.
    await createStay(db, h, {
      guest: { lastName: "A" },
      roomTypeId: dbl.id,
      arrival: today,
      departure: addDays(today, 1),
    });
    await expect(
      createStay(db, h, {
        guest: { lastName: "B" },
        roomTypeId: dbl.id,
        arrival: today,
        departure: addDays(today, 1),
      }),
    ).rejects.toMatchObject({ message: "no_availability" });
    // The tour's rooming list uses the block (group rate), even though the hotel is "full".
    const ids = await pickupRooming(db, h, block.id, [
      { lastName: "Rezaei", roomTypeId: dbl.id },
      { lastName: "Ahmadi", roomTypeId: dbl.id },
    ]);
    const [picked] = await db.select().from(stays).where(eq(stays.id, ids[0]!));
    expect(picked!.totalCents).toBe(16_000);
    const b = await getBlock(db, h, block.id);
    expect(b.days.map((d) => d.picked)).toEqual([2, 2]);
    grid = await availabilityGrid(db, h, today, 2);
    expect(grid.types[0]!.days[0]).toMatchObject({ free: 0, blocked: 1 });

    // Overbooking allowance of 1 lets one more booking through.
    await db.execute(`update room_types set overbook_limit = 1 where id = '${dbl.id}'`);
    await createStay(db, h, {
      guest: { lastName: "Over" },
      roomTypeId: dbl.id,
      arrival: addDays(today, 1),
      departure: addDays(today, 2),
    });

    // Revenue management: +20 % once the night is at least half full.
    await savePricingRule(db, h, null, { minOccupancyPct: 50, adjustBps: 2000 });
    const q = await quoteStay(db, h.restaurant.id, {
      roomTypeId: dbl.id,
      arrival: addDays(today, 1),
      departure: addDays(today, 2),
      adults: 2,
    });
    expect(q.nights[0]!.rateCents).toBe(12_000);
    const far = await quoteStay(db, h.restaurant.id, {
      roomTypeId: dbl.id,
      arrival: addDays(today, 30),
      departure: addDays(today, 31),
      adults: 2,
    });
    expect(far.nights[0]!.rateCents).toBe(10_000);

    // Non-refundable cancellation policy: the whole stay.
    const nrf = await createRatePlan(db, h, { code: "NRF", name: "Non refundable", refundable: false });
    const later = await createStay(db, h, {
      guest: { lastName: "Late" },
      roomTypeId: dbl.id,
      ratePlanId: nrf.id,
      arrival: addDays(today, 10),
      departure: addDays(today, 12),
    });
    expect(await cancellationFee(db, h, later.id)).toMatchObject({
      feeCents: later.totalCents,
      reason: "non_refundable",
    });

    // Forecast and channel mix read the books.
    const fc = await forecast(db, h, today, 3);
    expect(fc.rows[0]).toMatchObject({ rooms: 4, sold: 3, blocked: 1 });
    const mix = await channelMix(db, h, today, addDays(today, 3));
    expect(mix.totals.nights).toBeGreaterThan(0);

    // Night audit: the unarrived guaranteed guest pays the first night; the block is released.
    // The overbooking allowance takes one more guaranteed booking tonight; the guest never comes.
    const guaranteed = await createStay(db, h, {
      guest: { lastName: "NoShow" },
      roomTypeId: dbl.id,
      arrival: today,
      departure: addDays(today, 1),
      guarantee: "card",
    });
    const res = await runNightAudit(db, h);
    expect(res.noShows).toBeGreaterThan(0);
    const fees = await db
      .select()
      .from(folioLines)
      .where(and(eq(folioLines.restaurantId, h.restaurant.id), eq(folioLines.sourceType, "no_show")));
    // Only the guaranteed booking pays its first night ("A" and the tour had no guarantee).
    expect(fees.map((f) => [f.sourceId, f.amountCents])).toEqual([[guaranteed.id, guaranteed.totalCents]]);
    expect((await getBlock(db, h, block.id)).block.status).toBe("released");
  });

  it("pre-check-in, deposits, commissions, cheques, suppliers and the cashier report", async () => {
    const { h, dbl, today } = await hotel(3);
    const stay = await createStay(db, h, {
      guest: { lastName: "Karimi", phone: "09121112233" },
      roomTypeId: dbl.id,
      arrival: today,
      departure: addDays(today, 1),
      source: "snapptrip",
    });
    // Online registration card before arrival.
    const view = await precheckinView(db, stay.code);
    expect(view).toMatchObject({ open: true, done: false, guest: { lastName: "Karimi" } });
    const card = {
      firstName: "Reza",
      fatherName: "Hassan",
      nationality: "IR",
      documentType: "id_card" as const,
      signature: "Reza Karimi",
      accept: true as const,
    };
    await expect(
      submitPrecheckin(db, stay.code, { ...card, documentNumber: "1234567890" }),
    ).rejects.toBeTruthy();
    await submitPrecheckin(db, stay.code, { ...card, documentNumber: withCheck("123456789"), eta: "16:00" });
    expect(await precheckinView(db, stay.code)).toMatchObject({
      done: true,
      eta: "16:00",
      guest: { fatherName: "Hassan" },
    });

    // A deposit taken before arrival sits in advance deposits until check-in.
    const folioId = (await getStay(db, h, stay.id)).folios[0]!.id;
    await postPayment(db, h, folioId, { amountCents: 5_000, method: "transfer" });
    await syncLedger(db, h.restaurant);
    expect(await balanceOf(h.restaurant.id, "advance_deposits")).toBe(-5_000);
    await checkIn(db, h, stay.id);
    await syncLedger(db, h.restaurant);
    expect(await balanceOf(h.restaurant.id, "advance_deposits")).toBe(0);

    // The rest is paid by cheque, the guest leaves: the platform's 15 % commission is accrued.
    await runNightAudit(db, h);
    const due = (await getStay(db, h, stay.id)).folios[0]!.balanceCents;
    await postPayment(db, h, folioId, {
      amountCents: due,
      method: "cheque",
      cheque: {
        sayadId: "1234567890123456",
        number: "889900",
        bank: "Mellat",
        party: "Reza Karimi",
        dueDate: addDays(today, 20),
      },
    });
    await checkOut(db, h, stay.id);
    await syncLedger(db, h.restaurant);
    expect(await balanceOf(h.restaurant.id, "expense_commissions")).toBe(
      Math.round(((10_000 - 909) * 1500) / 10_000),
    );
    const reg = await chequeRegister(db, h, "received");
    expect(reg.rows).toHaveLength(1);
    expect(reg.totals.receivedOpen).toBe(due);
    // Bounced, then cleared when presented again.
    const cheque = reg.rows[0]!;
    await setChequeStatus(db, h, cheque.id, "deposited");
    await setChequeStatus(db, h, cheque.id, "bounced");
    await syncLedger(db, h.restaurant);
    expect(await balanceOf(h.restaurant.id, "bounced_cheques")).toBe(due);
    await expect(setChequeStatus(db, h, cheque.id, "deposited")).rejects.toMatchObject({
      message: "invalid_transition",
    });
    await setChequeStatus(db, h, cheque.id, "cleared");
    await syncLedger(db, h.restaurant);
    expect(await balanceOf(h.restaurant.id, "bounced_cheques")).toBe(0);
    expect(await balanceOf(h.restaurant.id, "cheques_receivable")).toBe(0);

    // A supplier invoice paid with an issued cheque, which clears later.
    const sup = await createSupplier(db, h, { name: "Pakhsh Co" });
    const item = await createStockItem(db, h, { name: "Soap", unit: "piece" });
    await createPurchase(db, h, {
      supplierId: sup.id,
      lines: [{ stockItemId: item.id, quantity: 10, unitCostCents: 300 }],
    });
    await paySupplier(db, h, {
      supplierId: sup.id,
      amountCents: 2_000,
      method: "cheque",
      paidOn: today,
      cheque: { dueDate: addDays(today, 30), number: "11" },
    });
    const aging = await payablesAging(db, h, today);
    expect(aging.rows[0]).toMatchObject({ invoiced: 3_000, paid: 2_000, total: 1_000 });
    const issued = (await chequeRegister(db, h, "issued")).rows[0]!;
    await setChequeStatus(db, h, issued.id, "cleared");
    await syncLedger(db, h.restaurant);
    expect(await balanceOf(h.restaurant.id, "accounts_payable")).toBe(-1_000);
    expect(await balanceOf(h.restaurant.id, "cheques_payable")).toBe(0);

    const tb = await trialBalance(db, h, addDays(today, -1), addDays(today, 40));
    expect(tb.totals.debit).toBe(tb.totals.credit);
    const cash = await cashierReport(db, h, today);
    expect(cash.total).toBeGreaterThanOrEqual(5_000);
  });

  it("runs a chain: new hotels inherit the setup, the group sees and searches every hotel", async () => {
    const { h, today, sessionUser } = await hotel(2);
    const second = await createBranch(db, h, {
      name: "Chain Hotel Shiraz",
      copyMenu: false,
      copySettings: true,
    });
    const h2 = await loadRestaurantContext(db, sessionUser, second.id);
    const types = await db.execute(`select code from room_types where restaurant_id = '${second.id}'`);
    expect(types.rows.map((r) => (r as { code: string }).code)).toEqual(["DBL"]);
    await bulkCreateTables(db, h2, { from: 1, to: 3, kind: "room" });
    const [t2] = (await db.execute(`select id from room_types where restaurant_id = '${second.id}'`))
      .rows as { id: string }[];
    await assignRoomType(
      db,
      h2,
      (await listTables(db, h2)).map((r) => r.id),
      t2!.id,
    );
    await createStay(db, h2, {
      guest: { lastName: "Moradi" },
      roomTypeId: t2!.id,
      arrival: today,
      departure: addDays(today, 2),
    });

    const o = await chainOverview(db, h);
    expect(o.hotels.map((x) => x.name).sort()).toEqual(["Chain Hotel", "Chain Hotel Shiraz"]);
    expect(o.totals).toMatchObject({ rooms: 5, sold: 1 });
    const found = await chainSearch(db, h, "morad");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ hotel: "Chain Hotel Shiraz", restaurantId: second.id });
    const fin = await chainFinancials(db, h, addDays(today, -1), addDays(today, 1));
    expect(fin.hotels).toHaveLength(2);
    expect(fin.hotels.every((x) => x.balanced)).toBe(true);
  });
});
