import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { restaurants, staffTips, stays } from "@/server/db/schema";
import { bulkCreateTables, listTables } from "@/server/modules/tables/service";
import { assignRoomType, createRatePlan, createRoomType } from "@/server/modules/pms/setup";
import { checkIn, createStay } from "@/server/modules/pms/stays";
import { voidLine } from "@/server/modules/pms/folios";
import { leaveTip, payOutTips, tipsReport } from "@/server/modules/pms/tips";
import { setHousekeeping } from "@/server/modules/hotel/rooms";
import { localDay } from "@/lib/period";
import { createOwnerWithRestaurant } from "../helpers/factories";

describe("named tips", () => {
  it("drops a tip whose folio charge was voided: not reported, never handed over", async () => {
    const { ctx } = await createOwnerWithRestaurant("Tips Hotel", { plan: "enterprise" });
    await db.update(restaurants).set({ kind: "hotel" }).where(eq(restaurants.id, ctx.restaurant.id));
    const h = { ...ctx, restaurant: { ...ctx.restaurant, kind: "hotel" as const } };
    await bulkCreateTables(db, h, { from: 401, to: 401, kind: "room" });
    const type = await createRoomType(db, h, {
      code: "DBL",
      name: "Double",
      baseOccupancy: 2,
      maxOccupancy: 2,
      baseRateCents: 10_000,
    });
    const [room] = (await listTables(db, h)).filter((r) => r.kind === "room");
    await assignRoomType(db, h, [room!.id], type.id);
    await setHousekeeping(db, h, room!.id, "clean");
    await createRatePlan(db, h, { code: "RO", name: "Room only", mealPlan: "RO", isDefault: true });
    const today = localDay(new Date(), h.restaurant.timezone);
    const stay = await createStay(db, h, {
      guest: { firstName: "Sara", lastName: "Ahmadi" },
      roomTypeId: type.id,
      arrival: today,
      departure: new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10),
    });
    await db.update(stays).set({ roomId: room!.id }).where(eq(stays.id, stay.id));
    await checkIn(db, h, stay.id, {});

    const kept = await leaveTip(db, h.restaurant, stay.id, { staffUserId: ctx.user.id, amountCents: 500 });
    expect(kept.amountCents).toBe(500);
    await leaveTip(db, h.restaurant, stay.id, { staffUserId: ctx.user.id, amountCents: 300 });
    const range = [new Date(Date.now() - 3_600_000), new Date(Date.now() + 3_600_000)] as const;
    const before = await tipsReport(db, h, ...range);
    expect(before.staff[0]).toMatchObject({ count: 2, totalCents: 800, unpaidCents: 800 });

    // The front desk voids the 300 charge: the guest no longer pays it.
    const [voided] = await db
      .select()
      .from(staffTips)
      .where(and(eq(staffTips.stayId, stay.id), eq(staffTips.amountCents, 300)));
    await voidLine(db, h, voided!.folioLineId!, "Guest changed their mind");
    const after = await tipsReport(db, h, ...range);
    expect(after.staff[0]).toMatchObject({ count: 1, totalCents: 500, unpaidCents: 500 });
    expect(after.recent).toHaveLength(1);

    // Only the standing tip is handed over.
    const paid = await payOutTips(db, h, ctx.user.id);
    expect(paid).toMatchObject({ count: 1, totalCents: 500 });
  });
});
