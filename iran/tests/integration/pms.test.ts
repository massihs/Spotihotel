import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { diningTables, folioLines, ledgerAccounts, orders, restaurants, stays } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { bulkCreateTables, listTables } from "@/server/modules/tables/service";
import { enterTableByQr, loadGuestContext } from "@/server/modules/guest/sessions";
import { addToCart } from "@/server/modules/cart/service";
import { placeOrder } from "@/server/modules/orders/service";
import {
  assignRoomType,
  createRatePlan,
  createRoomType,
  getPmsSettings,
  setRateRange,
  updatePmsSettings,
} from "@/server/modules/pms/setup";
import {
  availabilityGrid,
  checkIn,
  checkOut,
  createStay,
  frontDesk,
  getStay,
} from "@/server/modules/pms/stays";
import {
  postCharge,
  postPayment,
  voidLine,
  folioView,
  transferFolioToAccount,
} from "@/server/modules/pms/folios";
import { autoChargeOrder } from "@/server/modules/pms/room-charges";
import { runNightAudit } from "@/server/modules/pms/night-audit";
import { saveAccount } from "@/server/modules/pms/guests";
import { addDays } from "@/server/modules/pms/calc";
import { syncLedger } from "@/server/modules/ledger/sync";
import { createManualEntry, lockBooks, reverseEntry } from "@/server/modules/ledger/service";
import {
  agedReceivables,
  balanceSheet,
  exportFec,
  generalLedger,
  incomeStatement,
  trialBalance,
} from "@/server/modules/ledger/reports";
import { createOwnerWithRestaurant } from "../helpers/factories";

async function hotel() {
  const { ctx } = await createOwnerWithRestaurant("Grand Hôtel", { plan: "professional" });
  await db.update(restaurants).set({ kind: "hotel" }).where(eq(restaurants.id, ctx.restaurant.id));
  const h = { ...ctx, restaurant: { ...ctx.restaurant, kind: "hotel" as const } };
  await bulkCreateTables(db, h, { from: 101, to: 104, kind: "room" });
  const rooms = (await listTables(db, h)).filter((r) => r.kind === "room");
  await updatePmsSettings(db, h, {
    checkInTime: "14:00",
    checkOutTime: "12:00",
    roomTaxBps: 1000,
    serviceTaxBps: 1000,
    cityTaxCents: 200,
    autoChargeRoomService: true,
    minibarSelfService: true,
  });
  const dbl = await createRoomType(db, h, {
    code: "dbl",
    name: "Double",
    baseOccupancy: 2,
    maxOccupancy: 3,
    baseRateCents: 10_000,
    extraAdultCents: 3_000,
  });
  const ste = await createRoomType(db, h, {
    code: "STE",
    name: "Suite",
    baseOccupancy: 2,
    maxOccupancy: 4,
    baseRateCents: 25_000,
  });
  await assignRoomType(
    db,
    h,
    rooms.slice(0, 3).map((r) => r.id),
    dbl.id,
  );
  await assignRoomType(db, h, [rooms[3]!.id], ste.id);
  const bb = await createRatePlan(db, h, {
    code: "BB",
    name: "Bed & breakfast",
    mealPlan: "BB",
    adjustCents: 1_500,
    isDefault: true,
  });
  const settings = await getPmsSettings(db, h.restaurant.id, h.restaurant.timezone);
  return { h, rooms, dbl, ste, bb, today: settings.businessDate };
}

/** Account code of a system account (the chart differs per edition). */
async function codeOf(restaurantId: string, key: string) {
  const [a] = await db
    .select({ code: ledgerAccounts.code })
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.restaurantId, restaurantId), eq(ledgerAccounts.systemKey, key)));
  return a!.code;
}

async function seat(qrToken: string) {
  const guestId = randomUUID();
  const e = await enterTableByQr(db, qrToken, guestId);
  return (await loadGuestContext(db, guestId, e!.participant.id))!;
}

describe("hotel PMS", () => {
  it("books, checks in, charges, audits, checks out and keeps balanced books", async () => {
    const { h, rooms, dbl, today } = await hotel();
    expect(dbl.code).toBe("DBL");

    // A higher price on the second night (yield), booked with the default B&B plan.
    await setRateRange(db, h, {
      roomTypeId: dbl.id,
      from: addDays(today, 1),
      to: addDays(today, 1),
      rateCents: 12_000,
    });
    const stay = await createStay(db, h, {
      guest: { firstName: "Ada", lastName: "Lovelace", phone: "+33600000000" },
      roomTypeId: dbl.id,
      arrival: today,
      departure: addDays(today, 2),
      adults: 2,
    });
    expect(stay.totalCents).toBe(10_000 + 1_500 + 12_000 + 1_500);
    expect(stay.number).toBe(1001);

    // Only 3 doubles: the 4th booking of the same night is refused.
    for (const name of ["B", "C"])
      await createStay(db, h, {
        guest: { lastName: name },
        roomTypeId: dbl.id,
        arrival: today,
        departure: addDays(today, 1),
      });
    await expect(
      createStay(db, h, {
        guest: { lastName: "D" },
        roomTypeId: dbl.id,
        arrival: today,
        departure: addDays(today, 1),
      }),
    ).rejects.toMatchObject({ message: "no_availability" });
    const grid = await availabilityGrid(db, h, today, 3);
    const dblRow = grid.types.find((t) => t.code === "DBL")!;
    expect(dblRow.days.map((d) => d.free)).toEqual([0, 2, 3]);

    // Check-in allocates a clean room automatically.
    const inHouse = await checkIn(db, h, stay.id);
    expect(inHouse.status).toBe("in_house");
    const room = rooms.find((r) => r.id === inHouse.roomId)!;
    const desk = await frontDesk(db, h);
    expect(desk.inHouse.map((s) => s.id)).toContain(stay.id);

    // Minibar at the desk, then room service from the room's QR goes on the bill.
    const card = await getStay(db, h, stay.id);
    const folioId = card.folios[0]!.id;
    await postCharge(db, h, folioId, {
      department: "minibar",
      description: "Water",
      quantity: 2,
      unitCents: 300,
    });
    const cat = await createCategory(db, h, { name: "Room service" });
    const club = await createProduct(db, h, { categoryId: cat.id, name: "Club sandwich", priceCents: 4_000 });
    const guest = await seat(room.qrToken);
    await addToCart(db, guest, { productId: club.id });
    const order = await placeOrder(db, guest);
    expect(await autoChargeOrder(db, h.restaurant, room.id, order.id)).toBeGreaterThan(0);
    const [paid] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(paid!.paymentStatus).toBe("paid");
    // Charged once only.
    expect(await autoChargeOrder(db, h.restaurant, room.id, order.id)).toBe(0);

    // Night audit refuses to close while someone due out is still in: none today.
    await checkIn(
      db,
      h,
      (
        await db
          .select()
          .from(stays)
          .where(and(eq(stays.restaurantId, h.restaurant.id), eq(stays.number, 1002)))
      )[0]!.id,
    );
    const a1 = await runNightAudit(db, h);
    expect(a1.roomsSold).toBe(2);
    expect(a1.noShows).toBe(1); // guest "C" never came
    // The second guest leaves next morning; the audit waits for it.
    await expect(runNightAudit(db, h)).rejects.toMatchObject({ message: "departures_pending" });
    const second = (
      await db
        .select()
        .from(stays)
        .where(and(eq(stays.restaurantId, h.restaurant.id), eq(stays.number, 1002)))
    )[0]!;
    await expect(checkOut(db, h, second.id)).rejects.toMatchObject({ message: "folio_not_settled" });
    const f2 = (await getStay(db, h, second.id)).folios[0]!;
    await postPayment(db, h, f2.id, { amountCents: f2.balanceCents, method: "cash" });
    await checkOut(db, h, second.id);
    const [dirty] = await db.select().from(diningTables).where(eq(diningTables.id, second.roomId!));
    expect(dirty!.housekeeping).toBe("dirty");

    await runNightAudit(db, h);
    const bill = await folioView(db, h.restaurant.id, folioId);
    const roomLines = bill.lines.filter((l) => l.department === "room");
    expect(roomLines.map((l) => l.amountCents)).toEqual([11_500, 13_500]);
    expect(bill.lines.filter((l) => l.department === "city_tax").map((l) => l.amountCents)).toEqual([
      400, 400,
    ]);
    expect(bill.balanceCents).toBe(
      11_500 + 13_500 + 800 + 600 + 4_000 + 0 /* order total incl. VAT */ + (paid!.totalCents - 4_000),
    );

    // A disputed minibar line is voided (kept, struck through, reversed in the books).
    const minibar = bill.lines.find((l) => l.department === "minibar")!;
    await voidLine(db, h, minibar.id, "Guest did not drink it");
    const after = await folioView(db, h.restaurant.id, folioId);
    expect(after.balanceCents).toBe(bill.balanceCents - 600);

    await postPayment(db, h, folioId, { amountCents: after.balanceCents, method: "card" });
    const out = await checkOut(db, h, stay.id);
    expect(out.status).toBe("checked_out");

    // Books: every entry balances, the guest ledger is back to zero.
    await syncLedger(db, h.restaurant);
    const until = addDays(today, 2);
    const tb = await trialBalance(db, h, addDays(today, -1), until);
    expect(tb.totals.debit).toBe(tb.totals.credit);
    expect(tb.totals.closingDebit).toBe(tb.totals.closingCredit);
    const GL = await codeOf(h.restaurant.id, "guest_ledger");
    const guestLedger = tb.rows.find((r) => r.code === GL)!;
    expect(guestLedger.closingNet).toBe(0);
    const pl = await incomeStatement(db, h, today, until);
    const ROOM = await codeOf(h.restaurant.id, "revenue_room");
    const roomsRevenue = pl.revenue.find((r) => r.code === ROOM)!;
    // Rooms revenue excludes VAT (10% included in 11 500 + 13 500 + the 2nd guest's 11 500).
    expect(roomsRevenue.amount).toBe(25_000 + 11_500 - (1_045 + 1_227 + 1_045));
    const bs = await balanceSheet(db, h, until);
    expect(bs.balanced).toBe(true);
    // Re-running the sync posts nothing twice.
    expect(await syncLedger(db, h.restaurant)).toBe(0);
    const cash = await generalLedger(
      db,
      h,
      (
        await db
          .select()
          .from(ledgerAccounts)
          .where(and(eq(ledgerAccounts.restaurantId, h.restaurant.id), eq(ledgerAccounts.systemKey, "cash")))
      )[0]!.id,
      today,
      until,
    );
    expect(cash.closingNet).toBe(f2.balanceCents);
    expect((await exportFec(db, h, today, until)).split("\r\n")[0]).toMatch(/^JournalCode\tJournalLib/);
  });

  it("bills a company (city ledger), ages the debt, locks the books", async () => {
    const { h, ste, today } = await hotel();
    const acme = await saveAccount(db, h, null, { name: "ACME SA", paymentTermsDays: 30 });
    const stay = await createStay(db, h, {
      guest: { lastName: "Turing" },
      roomTypeId: ste.id,
      arrival: today,
      departure: addDays(today, 1),
      accountId: acme.id,
      guarantee: "company",
    });
    await checkIn(db, h, stay.id);
    await runNightAudit(db, h);
    await checkOut(db, h, stay.id, { toAccount: true });
    const aged = await agedReceivables(db, h, addDays(today, 1));
    expect(aged.accounts).toHaveLength(1);
    expect(aged.accounts[0]).toMatchObject({ name: "ACME SA", total: 25_000 + 1_500 + 200 });

    // A transfer is not revenue twice: rooms revenue is the night only.
    await syncLedger(db, h.restaurant);
    const tb = await trialBalance(db, h, today, addDays(today, 1));
    const CITY = await codeOf(h.restaurant.id, "city_ledger");
    const GUEST = await codeOf(h.restaurant.id, "guest_ledger");
    expect(tb.rows.find((r) => r.code === CITY)!.closingNet).toBe(26_700);
    expect(tb.rows.find((r) => r.code === GUEST)!.closingNet).toBe(0);

    // Manual entry (opening capital), reversal, then the period is locked.
    const accounts = await db
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.restaurantId, h.restaurant.id));
    const id = (key: string) => accounts.find((a) => a.systemKey === key)!.id;
    await expect(
      createManualEntry(db, h, {
        date: today,
        memo: "unbalanced",
        lines: [
          { accountId: id("bank"), debitCents: 100 },
          { accountId: id("equity"), creditCents: 99 },
        ],
      }),
    ).rejects.toBeTruthy();
    const e = await createManualEntry(db, h, {
      date: today,
      memo: "Apport en capital",
      lines: [
        { accountId: id("bank"), debitCents: 1_000_000 },
        { accountId: id("equity"), creditCents: 1_000_000 },
      ],
    });
    await reverseEntry(db, h, e.id, today);
    await expect(reverseEntry(db, h, e.id, today)).rejects.toMatchObject({ message: "already_reversed" });
    await lockBooks(db, h, today);
    await expect(
      createManualEntry(db, h, {
        date: today,
        memo: "late",
        lines: [
          { accountId: id("bank"), debitCents: 10 },
          { accountId: id("equity"), creditCents: 10 },
        ],
      }),
    ).rejects.toMatchObject({ message: "period_locked" });
    const bs = await balanceSheet(db, h, addDays(today, 1));
    expect(bs.balanced).toBe(true);
    // Company pays: the account is settled.
    const statement = (
      await db.select().from(folioLines).where(eq(folioLines.restaurantId, h.restaurant.id))
    ).find((l) => l.department === "transfer" && l.amountCents > 0)!;
    await postPayment(db, h, statement.folioId, { amountCents: 26_700, method: "transfer" });
    expect((await agedReceivables(db, h, addDays(today, 1))).accounts).toHaveLength(0);
    // Transfer of a guest folio with nothing on it is refused.
    const other = await createStay(db, h, {
      guest: { lastName: "X" },
      roomTypeId: ste.id,
      arrival: addDays(today, 3),
      departure: addDays(today, 4),
    });
    const f = (await getStay(db, h, other.id)).folios[0]!;
    await expect(transferFolioToAccount(db, h, f.id, acme.id)).rejects.toMatchObject({
      message: "nothing_to_transfer",
    });
  });
});
