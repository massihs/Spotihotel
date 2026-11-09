import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { diningTables, restaurants } from "@/server/db/schema";
import { bulkCreateTables, listTables } from "@/server/modules/tables/service";
import { assignRoomType, createRatePlan, createRoomType, getPmsSettings } from "@/server/modules/pms/setup";
import { createStay } from "@/server/modules/pms/stays";
import { setHousekeeping } from "@/server/modules/hotel/rooms";
import {
  createTicket,
  distributeRooms,
  housekeepingPlan,
  listTickets,
  myRooms,
  setTicketStatus,
} from "@/server/modules/hotel/housekeeping";
import { addDays } from "@/server/modules/pms/calc";
import { addMember, contextFor, createOwnerWithRestaurant, createUser } from "../helpers/factories";

describe("housekeeping and maintenance", () => {
  it("shares out the rooms, lets each housekeeper work their list, and takes rooms out of order", async () => {
    const { ctx } = await createOwnerWithRestaurant("Housekeeping Hotel", { plan: "enterprise" });
    await db.update(restaurants).set({ kind: "hotel" }).where(eq(restaurants.id, ctx.restaurant.id));
    const h = { ...ctx, restaurant: { ...ctx.restaurant, kind: "hotel" as const } };
    await bulkCreateTables(db, h, { from: 101, to: 104, kind: "room" });
    await bulkCreateTables(db, h, { from: 201, to: 202, kind: "room" });
    const std = await createRoomType(db, h, {
      code: "STD",
      name: "Standard",
      baseOccupancy: 2,
      maxOccupancy: 2,
      baseRateCents: 10_000,
    });
    const rooms = (await listTables(db, h)).filter((r) => r.kind === "room");
    const room = (n: number) => rooms.find((r) => r.number === n)!;
    await assignRoomType(
      db,
      h,
      rooms.map((r) => r.id),
      std.id,
    );
    await createRatePlan(db, h, { code: "RO", name: "Room only", isDefault: true });
    const { businessDate: today } = await getPmsSettings(db, h.restaurant.id, h.restaurant.timezone);
    // Room 104 has an arrival tonight; four rooms are dirty.
    await createStay(db, h, {
      guest: { lastName: "Arrival" },
      roomTypeId: std.id,
      roomId: room(104).id,
      arrival: today,
      departure: addDays(today, 1),
    });
    for (const n of [101, 102, 104, 201]) await setHousekeeping(db, h, room(n).id, "dirty");

    const a = await createUser();
    const b = await createUser();
    await addMember(h.restaurant.id, a.user.id, "staff");
    await addMember(h.restaurant.id, b.user.id, "staff");

    const plan = await housekeepingPlan(db, h);
    expect(plan.counts).toMatchObject({ dirty: 4, unassigned: 4 });
    expect(plan.rooms.find((r) => r.id === room(104).id)).toMatchObject({
      occupancy: "arrival",
      priority: true,
    });

    expect(await distributeRooms(db, h, [a.user.id, b.user.id])).toEqual({ assigned: 4, housekeepers: 2 });
    const ca = await contextFor(a.sessionUser, h.restaurant.id);
    const mine = await myRooms(db, ca);
    expect(mine.rooms).toHaveLength(2);
    // The arrival's room comes first, in the first share.
    expect(mine.rooms[0]!.id).toBe(room(104).id);

    // The housekeeper cleans; only a supervisor marks the room inspected.
    await setHousekeeping(db, ca, room(104).id, "cleaning");
    await setHousekeeping(db, ca, room(104).id, "clean");
    await expect(setHousekeeping(db, ca, room(104).id, "inspected")).rejects.toThrow();
    await setHousekeeping(db, h, room(104).id, "inspected");

    // A booking in 104 tonight: it cannot go out of order now; 202 can, until a day after.
    await expect(
      createTicket(db, h, { roomId: room(104).id, title: "Leak", outOfOrder: true, outFrom: today }),
    ).rejects.toMatchObject({ message: "room_booked_in_period" });
    const ticket = await createTicket(db, ca, {
      roomId: room(202).id,
      title: "Air conditioning",
      priority: "urgent",
      outOfOrder: true,
      outUntil: addDays(today, 2),
    });
    const [r202] = await db
      .select()
      .from(diningTables)
      .where(eq(diningTables.id, room(202).id));
    expect(r202!.housekeeping).toBe("out_of_order");
    expect((await listTickets(db, h))[0]).toMatchObject({ id: ticket.id, room: "202", status: "open" });

    // Fixed: back to housekeeping, dirty.
    await setTicketStatus(db, h, ticket.id, "done", "Compressor replaced");
    const [back] = await db
      .select()
      .from(diningTables)
      .where(eq(diningTables.id, room(202).id));
    expect(back!.housekeeping).toBe("dirty");
  });
});
