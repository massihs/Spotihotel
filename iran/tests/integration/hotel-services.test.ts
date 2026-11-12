import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { diningTables, folioLines, internetAccounts, restaurants, tvRooms } from "@/server/db/schema";
import { bulkCreateTables, listTables } from "@/server/modules/tables/service";
import {
  assignRoomType,
  createRatePlan,
  createRoomType,
  getPmsSettings,
  updatePmsSettings,
} from "@/server/modules/pms/setup";
import { checkIn, checkOut, createStay, getStay } from "@/server/modules/pms/stays";
import { postPayment } from "@/server/modules/pms/folios";
import { addDays } from "@/server/modules/pms/calc";
import {
  cancelServiceTicket,
  createServiceTicket,
  listServiceTickets,
  saveServiceItem,
  saveServicesSettings,
  serviceCashbox,
  serviceReport,
  setServiceTicketStatus,
  settleServiceTicket,
} from "@/server/modules/hotel/services";
import {
  createInternetAccount,
  listInternetAccounts,
  saveInternetProfile,
} from "@/server/modules/hotel/internet";
import { sendTvMessage, setRoomTv, tvActivity } from "@/server/modules/hotel/tv";
import { listEquipment, markServiced, saveEquipment } from "@/server/modules/hotel/engineering";
import {
  addLogEntry,
  cleaningReport,
  closeLogEntry,
  listLogbook,
  runHkOperation,
} from "@/server/modules/hotel/hk-extra";
import { setHousekeeping } from "@/server/modules/hotel/rooms";
import { createOwnerWithRestaurant } from "../helpers/factories";

async function hotel() {
  const { ctx } = await createOwnerWithRestaurant("Services Hotel", { plan: "enterprise" });
  await db.update(restaurants).set({ kind: "hotel" }).where(eq(restaurants.id, ctx.restaurant.id));
  const h = { ...ctx, restaurant: { ...ctx.restaurant, kind: "hotel" as const } };
  await bulkCreateTables(db, h, { from: 101, to: 103, kind: "room" });
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
  await createRatePlan(db, h, { code: "RO", name: "Room only", mealPlan: "RO", isDefault: true });
  const { businessDate: today } = await getPmsSettings(db, h.restaurant.id, h.restaurant.timezone);
  return { h, dbl, today, rooms };
}

const guest = {
  firstName: "Sara",
  lastName: "Ahmadi",
  nationality: "IR",
  documentType: "id_card" as const,
  documentNumber: "0012345679",
};

describe("hotel service departments", () => {
  it("laundry and damages: tickets on the bill or at the desk, workflow, cash desk and reports", async () => {
    const { h, dbl, today } = await hotel();
    const stay = await createStay(db, h, {
      guest,
      roomTypeId: dbl.id,
      arrival: today,
      departure: addDays(today, 2),
      adults: 1,
    });
    await checkIn(db, h, stay.id);
    const s = await getStay(db, h, stay.id);
    const roomId = s.stay.roomId!;
    const shirt = await saveServiceItem(db, h, "laundry", null, {
      name: "Shirt",
      category: "Wash",
      priceCents: 50_000,
    });
    const suit = await saveServiceItem(db, h, "laundry", null, { name: "Suit", priceCents: 200_000 });
    await saveServicesSettings(db, h, "laundry", { expressPct: 50, readyHours: 24, settleToRoom: true });

    // On the room's bill, express: 2 shirts + 1 suit = 300 000, +50% = 450 000.
    const t1 = await createServiceTicket(db, h, "laundry", {
      roomId,
      express: true,
      lines: [
        { itemId: shirt.id, quantity: 2 },
        { itemId: suit.id, quantity: 1 },
      ],
      settle: "room",
    });
    expect(t1).toMatchObject({
      number: 1,
      totalCents: 450_000,
      settlement: "room",
      status: "received",
      express: true,
    });
    const lines = await db
      .select()
      .from(folioLines)
      .where(and(eq(folioLines.restaurantId, h.restaurant.id), eq(folioLines.department, "laundry")));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ amountCents: 450_000, sourceType: "laundry", sourceId: t1.id });
    expect(lines[0]!.description).toContain("Shirt ×2");
    // A ticket already on the bill cannot be cancelled from the desk.
    await expect(cancelServiceTicket(db, h, t1.id)).rejects.toMatchObject({ message: "ticket_on_bill" });
    await setServiceTicketStatus(db, h, t1.id, "in_progress");
    await setServiceTicketStatus(db, h, t1.id, "ready");

    // A walk-in, paid later in cash; a walk-in can never go on a room bill.
    await expect(
      createServiceTicket(db, h, "laundry", {
        guestName: "Visitor",
        lines: [{ itemId: shirt.id, quantity: 1 }],
        settle: "room",
      }),
    ).rejects.toMatchObject({ message: "no_stay_in_room" });
    const t2 = await createServiceTicket(db, h, "laundry", {
      guestName: "Visitor",
      lines: [{ itemId: shirt.id, quantity: 1 }],
    });
    expect(t2).toMatchObject({ number: 2, settlement: "pending", totalCents: 50_000 });
    await settleServiceTicket(db, h, t2.id, "cash");
    await expect(settleServiceTicket(db, h, t2.id, "card")).rejects.toMatchObject({
      message: "ticket_settled",
    });
    await expect(settleServiceTicket(db, h, t2.id, "waived")).rejects.toBeTruthy();

    const list = await listServiceTickets(db, h, "laundry", { from: today, to: today });
    expect(list.map((x) => x.number)).toEqual([2, 1]);
    expect(list[1]).toMatchObject({ status: "ready", room: "101" });
    const cb = await serviceCashbox(db, h, "laundry", { from: today, to: today });
    expect(cb.by).toEqual({ room: { count: 1, cents: 450_000 }, cash: { count: 1, cents: 50_000 } });
    expect(cb.total).toBe(500_000);
    const rep = await serviceReport(db, h, "laundry", { from: today, to: today });
    expect(rep.byItem.rows.find((r) => r.item === "Shirt")).toMatchObject({ qty: 3, amount: 150_000 });
    expect(rep.byItem.rows.find((r) => r.item === "express")).toMatchObject({ amount: 150_000 });
    expect(rep.byDay.totals).toMatchObject({ tickets: 2, room: 450_000, cash: 50_000, amount: 500_000 });

    // Damages: recorded pending, then waived (no VAT, nothing on the bill).
    const glass = await saveServiceItem(db, h, "damage", null, { name: "Broken glass", priceCents: 80_000 });
    const d1 = await createServiceTicket(db, h, "damage", {
      roomId,
      lines: [{ itemId: glass.id, quantity: 1 }],
    });
    expect(d1).toMatchObject({ number: 1, status: "open", settlement: "pending" });
    await settleServiceTicket(db, h, d1.id, "waived");
    const d2 = await createServiceTicket(db, h, "damage", {
      roomId,
      lines: [{ itemId: glass.id, quantity: 2 }],
      settle: "room",
    });
    const dmg = await db
      .select()
      .from(folioLines)
      .where(and(eq(folioLines.restaurantId, h.restaurant.id), eq(folioLines.department, "damage")));
    expect(dmg).toEqual([expect.objectContaining({ amountCents: 160_000, taxCents: 0, sourceId: d2.id })]);
  });

  it("internet and TV follow the guest from check-in to check-out", async () => {
    const { h, dbl, today, rooms } = await hotel();
    const free = await saveInternetProfile(db, h, null, {
      name: "Basic",
      downKbps: 10_240,
      devices: 2,
      priceCents: 0,
    });
    const fast = await saveInternetProfile(db, h, null, {
      name: "Fast",
      downKbps: 51_200,
      days: 3,
      priceCents: 70_000,
    });
    await saveServicesSettings(db, h, "internet", {
      autoCreate: true,
      profileId: free.id,
      usernameMode: "room",
      passwordLength: 6,
      disableOnCheckout: true,
    });
    await saveServicesSettings(db, h, "tv", {
      autoActivate: true,
      deactivateOnCheckout: true,
      welcome: "Welcome {name}",
      packages: [
        { name: "Basic", priceCents: 0 },
        { name: "Sport", priceCents: 10_000 },
      ],
    });
    const stay = await createStay(db, h, {
      guest,
      roomTypeId: dbl.id,
      arrival: today,
      departure: addDays(today, 1),
      adults: 1,
    });
    await checkIn(db, h, stay.id, { roomId: rooms[0]!.id });
    const [auto] = await db.select().from(internetAccounts).where(eq(internetAccounts.stayId, stay.id));
    expect(auto).toMatchObject({ username: "r101", status: "active" });
    expect(auto!.password).toMatch(/^\d{6}$/);
    const [tv] = await db.select().from(tvRooms).where(eq(tvRooms.roomId, rooms[0]!.id));
    expect(tv).toMatchObject({ active: true, package: "Basic", message: "Welcome Sara Ahmadi" });

    // A paid plan bought at the desk goes on the bill; the username is free-form but unique.
    const acc = await createInternetAccount(db, h, {
      profileId: fast.id,
      roomId: rooms[0]!.id,
      username: "sara",
      charge: true,
    });
    expect(acc.validUntil).not.toBeNull();
    await expect(
      createInternetAccount(db, h, { profileId: fast.id, username: "sara" }),
    ).rejects.toMatchObject({ message: "username_taken" });
    const net = await db
      .select()
      .from(folioLines)
      .where(and(eq(folioLines.restaurantId, h.restaurant.id), eq(folioLines.department, "internet")));
    expect(net).toEqual([expect.objectContaining({ amountCents: 70_000, description: "Fast" })]);
    expect((await listInternetAccounts(db, h, "r101")).map((a) => a.username)).toEqual(["r101"]);

    await setRoomTv(db, h, rooms[0]!.id, { active: true, package: "Sport" });
    await expect(setRoomTv(db, h, rooms[0]!.id, { active: true, package: "Nope" })).rejects.toMatchObject({
      message: "unknown_package",
    });
    await sendTvMessage(db, h, null, "Pool closes at 22:00");

    // Check-out: the bill is paid, then logins are disabled and the TV is switched off.
    const folio = (await getStay(db, h, stay.id)).folios[0]!;
    await postPayment(db, h, folio.id, { method: "cash", amountCents: 170_000 });
    await checkOut(db, h, stay.id);
    const after = await db.select().from(internetAccounts).where(eq(internetAccounts.stayId, stay.id));
    expect(after.every((a) => a.status === "disabled")).toBe(true);
    const [tvAfter] = await db.select().from(tvRooms).where(eq(tvRooms.roomId, rooms[0]!.id));
    expect(tvAfter).toMatchObject({ active: false, message: null });
    const log = await tvActivity(db, h, today, addDays(today, 1));
    expect(log.rows.map((r) => r.event)).toEqual(["deactivated", "message", "package", "activated"]);
  });

  it("engineering and housekeeping: equipment, preventive services, logbook, bulk operations, report", async () => {
    const { h, dbl, today, rooms } = await hotel();
    const lift = await saveEquipment(db, h, null, { name: "Lift 1", category: "Lift", intervalDays: 30 });
    expect(lift.nextServiceOn).toBe(addDays(today, 30));
    await markServiced(db, h, lift.id, "cables checked");
    const [l] = await listEquipment(db, h);
    expect(l).toMatchObject({ lastServiceOn: today, nextServiceOn: addDays(today, 30) });

    const e = await addLogEntry(db, h, {
      category: "lost_found",
      roomId: rooms[1]!.id,
      text: "Watch found under the bed",
    });
    expect(e.status).toBe("open");
    await closeLogEntry(db, h, e.id);
    const book = await listLogbook(db, h, today, today);
    expect(book).toEqual([
      expect.objectContaining({ status: "closed", room: "102", category: "lost_found" }),
    ]);

    // Rooms: all start clean; an occupied one goes dirty, then is cleaned and inspected.
    const stay = await createStay(db, h, {
      guest,
      roomTypeId: dbl.id,
      arrival: today,
      departure: addDays(today, 2),
      adults: 1,
    });
    await checkIn(db, h, stay.id, { roomId: rooms[0]!.id });
    expect(await runHkOperation(db, h, "occupiedDirty")).toBe(1);
    await setHousekeeping(db, h, rooms[0]!.id, "clean");
    expect(await runHkOperation(db, h, "cleanInspected")).toBe(3);
    const [r1] = await db.select().from(diningTables).where(eq(diningTables.id, rooms[0]!.id));
    expect(r1!.housekeeping).toBe("inspected");
    await saveServicesSettings(db, h, "housekeeping", {
      dirtyStayoversDaily: true,
      inspectionRequired: true,
      credits: { [dbl.id]: 25 },
    });
    const report = await cleaningReport(db, h, today, today);
    expect(report.totals).toMatchObject({ cleaned: 1, credits: 25 });
    // Inspection required: a merely clean room is refused at check-in.
    await setHousekeeping(db, h, rooms[2]!.id, "clean");
    const other = await createStay(db, h, {
      guest: { ...guest, lastName: "Bahrami" },
      roomTypeId: dbl.id,
      arrival: today,
      departure: addDays(today, 1),
      adults: 1,
    });
    await expect(checkIn(db, h, other.id, { roomId: rooms[2]!.id })).rejects.toMatchObject({
      message: "room_not_inspected",
    });
  });
});
