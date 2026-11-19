import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { restaurants, stays } from "@/server/db/schema";
import { setSmsDriver } from "@/server/infra/sms";
import { bulkCreateTables, listTables } from "@/server/modules/tables/service";
import { assignRoomType, createRatePlan, createRoomType } from "@/server/modules/pms/setup";
import { createStay } from "@/server/modules/pms/stays";
import { setHousekeeping } from "@/server/modules/hotel/rooms";
import { readinessOf } from "@/server/modules/pms/ready";
import { localDay } from "@/lib/period";
import { createOwnerWithRestaurant } from "../helpers/factories";

afterEach(() => setSmsDriver(null));

describe("room ready", () => {
  it("shows the room being prepared, then texts the arriving guest once when it is clean", async () => {
    const sent: { to: string; text: string }[] = [];
    setSmsDriver({ send: async (to, text) => (sent.push({ to, text }), { ref: null }) });
    const { ctx } = await createOwnerWithRestaurant("Ready Hotel", { plan: "enterprise" });
    await db.update(restaurants).set({ kind: "hotel" }).where(eq(restaurants.id, ctx.restaurant.id));
    const h = { ...ctx, restaurant: { ...ctx.restaurant, kind: "hotel" as const } };
    await bulkCreateTables(db, h, { from: 201, to: 201, kind: "room" });
    const type = await createRoomType(db, h, {
      code: "DBL",
      name: "Double",
      baseOccupancy: 2,
      maxOccupancy: 2,
      baseRateCents: 10_000,
    });
    const [room] = (await listTables(db, h)).filter((r) => r.kind === "room");
    await assignRoomType(db, h, [room!.id], type.id);
    await createRatePlan(db, h, { code: "RO", name: "Room only", mealPlan: "RO", isDefault: true });
    const today = localDay(new Date(), h.restaurant.timezone);
    const stay = await createStay(db, h, {
      guest: { firstName: "Sara", lastName: "Ahmadi", phone: "09121234567" },
      roomTypeId: type.id,
      arrival: today,
      departure: new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10),
    });
    await db.update(stays).set({ roomId: room!.id }).where(eq(stays.id, stay.id));
    await setHousekeeping(db, h, room!.id, "dirty");
    const row = { ...stay, roomId: room!.id, restaurantId: h.restaurant.id, status: "confirmed" };
    expect((await readinessOf(db, row, h.restaurant.timezone))?.state).toBe("cleaning");

    await setHousekeeping(db, h, room!.id, "clean");
    expect((await readinessOf(db, row, h.restaurant.timezone))?.state).toBe("ready");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("09121234567");

    // Cleaned again later the same day: no second text.
    await setHousekeeping(db, h, room!.id, "dirty");
    await setHousekeeping(db, h, room!.id, "clean");
    expect(sent).toHaveLength(1);
  });
});
