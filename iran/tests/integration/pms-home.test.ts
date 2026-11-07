import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { restaurants } from "@/server/db/schema";
import { bulkCreateTables, listTables } from "@/server/modules/tables/service";
import {
  assignRoomType,
  createRatePlan,
  createRoomType,
  getPmsSettings,
  updatePmsSettings,
} from "@/server/modules/pms/setup";
import { checkIn, createStay, getStay } from "@/server/modules/pms/stays";
import { postCharge, postPayment } from "@/server/modules/pms/folios";
import { runNightAudit } from "@/server/modules/pms/night-audit";
import { hotelHome } from "@/server/modules/pms/home";
import { addDays } from "@/server/modules/pms/calc";
import { createOwnerWithRestaurant } from "../helpers/factories";

describe("hotel home dashboard", () => {
  it("shows tonight's figures, the day's movements, revenue per department and setup steps", async () => {
    const { ctx } = await createOwnerWithRestaurant("Home Hotel", { plan: "enterprise" });
    await db.update(restaurants).set({ kind: "hotel" }).where(eq(restaurants.id, ctx.restaurant.id));
    const h = { ...ctx, restaurant: { ...ctx.restaurant, kind: "hotel" as const } };

    // A bare hotel: nothing set up, nothing sold.
    const empty = await hotelHome(db, h);
    expect(empty.setup).toMatchObject({
      roomTypes: 0,
      ratePlans: 0,
      rooms: 0,
      roomsTyped: false,
      bookings: 0,
    });
    expect(empty.lastAudit).toBeNull();

    await bulkCreateTables(db, h, { from: 101, to: 104, kind: "room" });
    await updatePmsSettings(db, h, {
      checkInTime: "14:00",
      checkOutTime: "12:00",
      roomTaxBps: 1000,
      serviceTaxBps: 1000,
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
      maxOccupancy: 2,
      baseRateCents: 10_000,
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

    const a = await createStay(db, h, {
      guest: { firstName: "Sara", lastName: "Ahmadi" },
      roomTypeId: dbl.id,
      arrival: today,
      departure: addDays(today, 2),
      adults: 2,
    });
    await createStay(db, h, {
      guest: { firstName: "Reza", lastName: "Karimi" },
      roomTypeId: dbl.id,
      arrival: today,
      departure: addDays(today, 1),
    });
    await checkIn(db, h, a.id);
    const folio = (await getStay(db, h, a.id)).folios[0]!;
    await postCharge(db, h, folio.id, { department: "minibar", description: "Water", unitCents: 300 });
    await postPayment(db, h, folio.id, { amountCents: 200, method: "cash" });

    const home = await hotelHome(db, h);
    expect(home.businessDate).toBe(today);
    expect(home.figures).toMatchObject({ rooms: 4, sold: 2, occupancyPct: 50 });
    expect(home.arrivals.map((s) => s.lastName)).toEqual(["Karimi"]);
    expect(home.inHouse).toBe(1);
    expect(home.departments).toEqual([{ department: "minibar", cents: 300 }]);
    expect(home.revenueCents).toBe(300);
    expect(home.paymentsCents).toBe(200);
    expect(home.ahead).toHaveLength(14);
    expect(home.ahead[0]).toMatchObject({ day: today, sold: 2, rooms: 4 });
    expect(home.setup).toMatchObject({ roomTypes: 1, ratePlans: 1, rooms: 4, roomsTyped: true, bookings: 2 });

    // After the night audit the day appears as the last closed one, and tomorrow is the business day.
    await runNightAudit(db, h);
    const next = await hotelHome(db, h);
    expect(next.businessDate).toBe(addDays(today, 1));
    expect(next.lastAudit).toMatchObject({ businessDate: today, roomsSold: 1, roomsAvailable: 4 });
    // Karimi never came: marked no-show, gone from the arrivals; Ahmadi leaves the day after.
    expect(next.arrivals).toEqual([]);
    expect(next.departures).toEqual([]);
    expect(next.inHouse).toBe(1);
  });
});
