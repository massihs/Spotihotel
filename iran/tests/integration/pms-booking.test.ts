import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { restaurants } from "@/server/db/schema";
import { bulkCreateTables, listTables } from "@/server/modules/tables/service";
import { assignRoomType, createRatePlan, createRoomType, getPmsSettings } from "@/server/modules/pms/setup";
import { checkIn, createStay } from "@/server/modules/pms/stays";
import { runNightAudit } from "@/server/modules/pms/night-audit";
import {
  availableRooms,
  bookingOptions,
  checkInContext,
  identityComplete,
  updateGuestIdentity,
} from "@/server/modules/pms/booking";
import { searchGuests } from "@/server/modules/pms/guests";
import { addDays } from "@/server/modules/pms/calc";
import { isIranNationalCode } from "@/lib/iran-id";
import { createOwnerWithRestaurant } from "../helpers/factories";

async function hotel(name: string) {
  const { ctx } = await createOwnerWithRestaurant(name, { plan: "enterprise" });
  await db.update(restaurants).set({ kind: "hotel" }).where(eq(restaurants.id, ctx.restaurant.id));
  const h = { ...ctx, restaurant: { ...ctx.restaurant, kind: "hotel" as const } };
  await bulkCreateTables(db, h, { from: 101, to: 103, kind: "room" });
  const dbl = await createRoomType(db, h, {
    code: "DBL",
    name: "Double",
    baseOccupancy: 2,
    maxOccupancy: 3,
    baseRateCents: 10_000,
  });
  const ste = await createRoomType(db, h, {
    code: "STE",
    name: "Suite",
    baseOccupancy: 2,
    maxOccupancy: 4,
    baseRateCents: 25_000,
  });
  const rooms = (await listTables(db, h)).filter((r) => r.kind === "room");
  const byLabel = (n: number) => rooms.find((r) => r.number === n)!;
  await assignRoomType(db, h, [byLabel(101).id, byLabel(102).id], dbl.id);
  await assignRoomType(db, h, [byLabel(103).id], ste.id);
  await createRatePlan(db, h, { code: "RO", name: "Room only", mealPlan: "RO", isDefault: true });
  await createRatePlan(db, h, {
    code: "BB",
    name: "Bed & breakfast",
    mealPlan: "BB",
    adjustCents: 2_000,
    refundable: false,
  });
  const { businessDate: today } = await getPmsSettings(db, h.restaurant.id, h.restaurant.timezone);
  return { h, dbl, ste, today, room: byLabel };
}

describe("express booking", () => {
  it("prices every room type and plan for the dates and counts the rooms still free", async () => {
    const { h, dbl, ste, today, room } = await hotel("Booking Hotel");

    const opts = await bookingOptions(db, h, { arrival: today, departure: addDays(today, 2), adults: 2 });
    expect(opts.nights).toBe(2);
    expect(opts.businessDate).toBe(today);
    const d = opts.types.find((t) => t.id === dbl.id)!;
    const s = opts.types.find((t) => t.id === ste.id)!;
    expect(d).toMatchObject({ rooms: 2, available: 2, fits: true, closed: false });
    expect(s).toMatchObject({ rooms: 1, available: 1 });
    // Two plans per type: room only (default) and breakfast at +2 000 a night, non-refundable.
    const ro = d.quotes.find((q) => q.code === "RO")!;
    const bb = d.quotes.find((q) => q.code === "BB")!;
    expect(ro).toMatchObject({
      isDefault: true,
      refundable: true,
      totalCents: 20_000,
      perNightCents: 10_000,
    });
    expect(bb).toMatchObject({ mealPlan: "BB", refundable: false, totalCents: 24_000 });
    expect(d.fromCents).toBe(20_000);
    expect(s.fromCents).toBe(50_000);

    // A party too large for a double is flagged.
    const big = await bookingOptions(db, h, { arrival: today, departure: addDays(today, 1), adults: 4 });
    expect(big.types.find((t) => t.id === dbl.id)!.fits).toBe(false);
    expect(big.types.find((t) => t.id === ste.id)!.fits).toBe(true);

    // A booking on room 101 over the second night leaves one double for the whole stay.
    await createStay(db, h, {
      guest: { firstName: "Sara", lastName: "Ahmadi" },
      roomTypeId: dbl.id,
      roomId: room(101).id,
      arrival: addDays(today, 1),
      departure: addDays(today, 3),
    });
    const after = await bookingOptions(db, h, { arrival: today, departure: addDays(today, 2) });
    expect(after.types.find((t) => t.id === dbl.id)!.available).toBe(1);
    const free = await availableRooms(db, h.restaurant.id, {
      roomTypeId: dbl.id,
      arrival: today,
      departure: addDays(today, 2),
    });
    expect(free.map((r) => r.number)).toEqual([102]);
    // Before that booking starts, 101 is free again.
    const tonight = await availableRooms(db, h.restaurant.id, {
      roomTypeId: dbl.id,
      arrival: today,
      departure: addDays(today, 1),
    });
    expect(tonight.map((r) => r.number)).toEqual([101, 102]);

    // Dates in the past or upside down are refused.
    await expect(
      bookingOptions(db, h, { arrival: addDays(today, -1), departure: addDays(today, 1) }),
    ).rejects.toMatchObject({ code: "VALIDATION", message: "arrival_in_past" });
    await expect(bookingOptions(db, h, { arrival: today, departure: today })).rejects.toThrow();

    // The desk finds the guest by full name in either order and by Persian digits.
    await updateGuestIdentity(db, h, (await searchGuests(db, h, "Ahmadi"))[0]!.id, {
      firstName: "Sara",
      lastName: "Ahmadi",
      phone: "09121234567",
    });
    expect(await searchGuests(db, h, "Sara Ahmadi")).toHaveLength(1);
    expect(await searchGuests(db, h, "Ahmadi Sara")).toHaveLength(1);
    expect(await searchGuests(db, h, "۰۹۱۲۱۲۳")).toHaveLength(1);
  });
});

describe("guided check-in", () => {
  it("checks the police identity, lists the free rooms and never suggests a room still occupied", async () => {
    const { h, dbl, today, room } = await hotel("Check-in Hotel");

    const stay = await createStay(db, h, {
      guest: { firstName: "Reza", lastName: "Karimi" },
      roomTypeId: dbl.id,
      arrival: today,
      departure: addDays(today, 2),
    });
    const ctx1 = await checkInContext(db, h, stay.id);
    expect(ctx1.identityComplete).toBe(false);
    expect(ctx1.dueCents).toBe(stay.totalCents);
    expect(ctx1.firstNightCents).toBe(10_000);
    expect(ctx1.folioId).toBeTruthy();
    expect(ctx1.rooms.map((r) => r.number)).toEqual([101, 102, 103]);

    // An Iranian ID card needs a valid national code (check digit) and the father's name.
    const code = "0012345679";
    expect(isIranNationalCode(code)).toBe(true);
    await expect(
      updateGuestIdentity(db, h, ctx1.guest.id, {
        firstName: "Reza",
        lastName: "Karimi",
        nationality: "IR",
        documentType: "id_card",
        documentNumber: "0012345678",
      }),
    ).rejects.toThrow();
    await updateGuestIdentity(db, h, ctx1.guest.id, {
      firstName: "Reza",
      lastName: "Karimi",
      fatherName: "Ali",
      nationality: "IR",
      documentType: "id_card",
      documentNumber: "۰۰۱۲۳۴۵۶۷۹",
    });
    const ctx2 = await checkInContext(db, h, stay.id);
    expect(ctx2.guest.documentNumber).toBe(code);
    expect(ctx2.identityComplete).toBe(true);
    // A foreign guest needs a passport.
    expect(
      identityComplete({
        lastName: "Müller",
        fatherName: null,
        nationality: "DE",
        documentType: "passport",
        documentNumber: "C01X00T47",
      }),
    ).toBe(true);
    expect(
      identityComplete({
        lastName: "Müller",
        fatherName: null,
        nationality: "DE",
        documentType: "id_card",
        documentNumber: "C01X00T47",
      }),
    ).toBe(false);

    // Karimi takes 101 for one night only…
    const one = await createStay(db, h, {
      guest: { firstName: "Nima", lastName: "Rahimi" },
      roomTypeId: dbl.id,
      arrival: today,
      departure: addDays(today, 1),
    });
    await checkIn(db, h, one.id, { roomId: room(101).id });
    await runNightAudit(db, h);
    // …and has not checked out the next morning. A walk-in for tonight must not get 101,
    // even though the dates no longer overlap.
    const walkIn = await createStay(db, h, {
      guest: { firstName: "Mina", lastName: "Sadeghi" },
      roomTypeId: dbl.id,
      arrival: addDays(today, 1),
      departure: addDays(today, 2),
    });
    const ctx3 = await checkInContext(db, h, walkIn.id);
    expect(ctx3.rooms.find((r) => r.number === 101)?.occupiedNow).toBe(true);
    const checked = await checkIn(db, h, walkIn.id, { allowDirty: true });
    expect(checked.roomId).not.toBe(room(101).id);
  });
});
