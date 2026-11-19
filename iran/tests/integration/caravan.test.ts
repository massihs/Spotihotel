import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { restaurants } from "@/server/db/schema";
import { bulkCreateTables, listTables } from "@/server/modules/tables/service";
import { assignRoomType, createRatePlan, createRoomType, getPmsSettings } from "@/server/modules/pms/setup";
import { createBlock, pickupRooming } from "@/server/modules/pms/blocks";
import { caravanCheckIn, caravanView, setCaravan } from "@/server/modules/pms/caravan";
import { addDays } from "@/server/modules/pms/calc";
import { createOwnerWithRestaurant } from "../helpers/factories";

describe("pilgrim caravan", () => {
  it("gives the leader a private page and checks the caravan in at once", async () => {
    const { ctx } = await createOwnerWithRestaurant("Caravan Hotel", { plan: "enterprise" });
    await db
      .update(restaurants)
      .set({ kind: "hotel", latitude: 36.29, longitude: 59.6 })
      .where(eq(restaurants.id, ctx.restaurant.id));
    const h = { ...ctx, restaurant: { ...ctx.restaurant, kind: "hotel" as const } };
    await bulkCreateTables(db, h, { from: 301, to: 303, kind: "room" });
    const twin = await createRoomType(db, h, {
      code: "TWN",
      name: "Twin",
      baseOccupancy: 2,
      maxOccupancy: 2,
      baseRateCents: 10_000,
    });
    const rooms = (await listTables(db, h)).filter((r) => r.kind === "room");
    await assignRoomType(
      db,
      h,
      rooms.map((r) => r.id),
      twin.id,
    );
    await createRatePlan(db, h, { code: "RO", name: "Room only", mealPlan: "RO", isDefault: true });
    const { businessDate: today } = await getPmsSettings(db, h.restaurant.id, h.restaurant.timezone);
    const block = await createBlock(db, h, {
      name: "Caravane Al-Nour",
      status: "definite",
      arrival: today,
      departure: addDays(today, 2),
      releaseDate: today,
      rooms: [{ roomTypeId: twin.id, rooms: 2 }],
    });
    await pickupRooming(db, h, block.id, [
      { lastName: "Al-Musawi", firstName: "Ali", roomTypeId: twin.id, adults: 2 },
      { lastName: "Al-Husseini", firstName: "Hassan", roomTypeId: twin.id, adults: 2 },
    ]);
    const saved = await setCaravan(db, h, block.id, {
      caravan: true,
      schedule: "06:30 Shuttle\n\n13:00 Lunch",
    });
    expect(saved.leaderToken).toMatch(/^[A-Za-z0-9_-]{20}$/);

    const before = await caravanView(db, saved.leaderToken!);
    expect(before?.pilgrims).toHaveLength(2);
    expect(before?.schedule).toEqual(["06:30 Shuttle", "13:00 Lunch"]);
    expect(before?.prayer?.dhuhr).toMatch(/^\d\d:\d\d$/);

    const res = await caravanCheckIn(db, h, block.id);
    expect(res).toEqual({ done: 2, waiting: 0 });
    const after = await caravanView(db, saved.leaderToken!);
    expect(after?.pilgrims.every((p) => p.status === "in_house" && p.room)).toBe(true);

    // Turned off: the link stops working.
    await setCaravan(db, h, block.id, { caravan: false });
    expect(await caravanView(db, saved.leaderToken!)).toBeNull();
  });
});
