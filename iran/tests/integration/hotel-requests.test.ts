import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { restaurantMembers, restaurants, serviceRequests } from "@/server/db/schema";
import { bulkCreateTables, listTables } from "@/server/modules/tables/service";
import { enterTableByQr, loadGuestContext } from "@/server/modules/guest/sessions";
import { callWaiter } from "@/server/modules/guest/waiter";
import { addMember, setMemberJob } from "@/server/modules/members/service";
import { deleteTeamJob, listTeamJobs, saveTeamJob } from "@/server/modules/team/jobs";
import { guestCallsOf, saveGuestCalls, listGuestCalls } from "@/server/modules/team/sections";
import { hotelToday, listRequests, moveRequest } from "@/server/modules/hotel/requests";
import { checkOutRoom, floorOf, roomsBoard, setHousekeeping } from "@/server/modules/hotel/rooms";
import { createOwnerWithRestaurant, uniqueEmail } from "../helpers/factories";

async function seat(qrToken: string) {
  const guestId = randomUUID();
  const e = await enterTableByQr(db, qrToken, guestId);
  return (await loadGuestContext(db, guestId, e!.participant.id))!;
}

async function hotelOwner(name: string) {
  const { ctx } = await createOwnerWithRestaurant(name, { plan: "professional" });
  await db.update(restaurants).set({ kind: "hotel" }).where(eq(restaurants.id, ctx.restaurant.id));
  return { ...ctx, restaurant: { ...ctx.restaurant, kind: "hotel" as const } };
}

describe("team jobs", () => {
  it("starts from the kind's jobs, lets the owner add, rename and remove them", async () => {
    const { ctx } = await createOwnerWithRestaurant("Jobs");
    const start = await listTeamJobs(db, ctx);
    expect(start.map((j) => j.baseJob)).toEqual(["manager", "cashier", "waiter", "bar", "kitchen"]);
    // Opening the team again does not duplicate them.
    expect(await listTeamJobs(db, ctx)).toHaveLength(5);

    await saveTeamJob(db, ctx, { name: "Chicha", icon: "flame", baseJob: "waiter" });
    const chicha = (await listTeamJobs(db, ctx)).find((j) => j.name === "Chicha")!;
    expect(chicha).toMatchObject({ icon: "flame", baseJob: "waiter" });

    const m = await addMember(db, ctx, {
      email: uniqueEmail("chicha"),
      fullName: "Reza",
      role: "staff",
      teamJobId: chicha.id,
      password: "CorrectHorse42!",
    });
    let [row] = await db.select().from(restaurantMembers).where(eq(restaurantMembers.id, m.member.id));
    expect(row).toMatchObject({ job: "waiter", teamJobId: chicha.id });

    // Its base cannot change while someone holds it; the name and icon can.
    await expect(
      saveTeamJob(db, ctx, { id: chicha.id, name: "Chicha", icon: "flame", baseJob: "bar" }),
    ).rejects.toMatchObject({ message: "job_in_use" });
    await saveTeamJob(db, ctx, { id: chicha.id, name: "Narguilé", icon: "wine", baseJob: "waiter" });

    // Moving the member to a built-in job, then deleting the custom one.
    const cashier = start.find((j) => j.baseJob === "cashier")!;
    await setMemberJob(db, ctx, m.member.id, { job: null, stationId: null, teamJobId: cashier.id });
    [row] = await db.select().from(restaurantMembers).where(eq(restaurantMembers.id, m.member.id));
    expect(row).toMatchObject({ job: "cashier", teamJobId: cashier.id });
    await setMemberJob(db, ctx, m.member.id, { job: null, stationId: null, teamJobId: chicha.id });
    await deleteTeamJob(db, ctx, chicha.id);
    [row] = await db.select().from(restaurantMembers).where(eq(restaurantMembers.id, m.member.id));
    expect(row).toMatchObject({ job: "waiter", teamJobId: null });

    // Another restaurant's job is not usable here.
    const other = await createOwnerWithRestaurant("Other jobs");
    const foreign = (await listTeamJobs(db, other.ctx))[0]!;
    await expect(
      setMemberJob(db, ctx, m.member.id, { job: null, stationId: null, teamJobId: foreign.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("gives a hotel its front desk, housekeeping and room service", async () => {
    const hotel = await hotelOwner("Jobs hotel");
    const jobs = await listTeamJobs(db, hotel);
    expect(jobs.map((j) => [j.icon, j.baseJob])).toEqual([
      ["crown", "manager"],
      ["concierge", "cashier"],
      ["bed", "waiter"],
      ["hand-platter", "waiter"],
      ["chef-hat", "kitchen"],
      ["coffee", "bar"],
    ]);
  });
});

describe("hotel requests", () => {
  it("turns a room's call into a request the front desk takes and finishes", async () => {
    const hotel = await hotelOwner("Requests hotel");
    await bulkCreateTables(db, hotel, { from: 201, to: 203, kind: "room" });
    const rooms = await listTables(db, hotel);

    // Room services: the main ones on by default, the others to switch on; custom ones can
    // be for rooms only.
    const calls = await listGuestCalls(db, hotel);
    expect(calls.find((c) => c.key === "laundry")?.enabled).toBe(true);
    expect(calls.find((c) => c.key === "taxi")?.enabled).toBe(false);
    await saveGuestCalls(db, hotel, [
      ...calls.map((c) => (c.key === "taxi" ? { ...c, enabled: true } : c)),
      { key: "c-spa001", label: "Spa", icon: "sparkles", enabled: true, roomOnly: true },
    ]);
    const inRoom = (await guestCallsOf(db, hotel.restaurant.id, { room: true })).map((c) => c.key);
    expect(inRoom).toEqual(expect.arrayContaining(["laundry", "taxi", "c-spa001"]));
    const atTable = (await guestCallsOf(db, hotel.restaurant.id)).map((c) => c.key);
    expect(atTable).not.toContain("c-spa001");
    expect(atTable).not.toContain("laundry");

    const guest = await seat(rooms.find((r) => r.label === "202")!.qrToken);
    await callWaiter(db, guest, "laundry", new Date(), "  2 chemises  ");
    const [req] = await listRequests(db, hotel);
    expect(req).toMatchObject({ placeLabel: "202", kind: "laundry", note: "2 chemises", status: "open" });

    expect(await hotelToday(db, hotel)).toMatchObject({ rooms: 3, occupied: 1, open: 1, inProgress: 0 });
    await moveRequest(db, hotel, req!.id, "in_progress");
    await expect(moveRequest(db, hotel, req!.id, "in_progress")).rejects.toMatchObject({
      message: "invalid_transition",
    });
    await moveRequest(db, hotel, req!.id, "done");
    const [done] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, req!.id));
    expect(done).toMatchObject({ status: "done", takenByUserId: hotel.user.id });
    expect(done!.doneAt).toBeInstanceOf(Date);
    await expect(moveRequest(db, hotel, req!.id, "open")).rejects.toMatchObject({
      message: "invalid_transition",
    });
    expect(await hotelToday(db, hotel)).toMatchObject({ open: 0, doneToday: 1 });

    // Another hotel cannot touch it.
    const other = await hotelOwner("Other hotel");
    await expect(moveRequest(db, other, req!.id, "done")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("hotel rooms", () => {
  it("groups rooms by floor, tracks housekeeping and checks guests out", async () => {
    expect(floorOf({ label: "204", zone: null, number: 204 })).toMatchObject({ key: "f:2", label: 2 });
    expect(floorOf({ label: "12", zone: null, number: 12 })).toMatchObject({ key: "f:0", label: 0 });
    expect(floorOf({ label: "Suite A", zone: " Villa ", number: null })).toMatchObject({
      key: "z:villa",
      label: "Villa",
    });

    const hotel = await hotelOwner("Rooms hotel");
    await bulkCreateTables(db, hotel, { from: 101, to: 102, kind: "room" });
    await bulkCreateTables(db, hotel, { from: 201, to: 203, kind: "room" });
    const rooms = await listTables(db, hotel);
    const r201 = rooms.find((r) => r.label === "201")!;
    const r102 = rooms.find((r) => r.label === "102")!;

    const guest = await seat(r201.qrToken);
    await callWaiter(db, guest, "housekeeping", new Date());
    let board = await roomsBoard(db, hotel);
    expect(board.floors.map((f) => f.label)).toEqual([1, 2]);
    const b201 = board.rooms.find((r) => r.id === r201.id)!;
    expect(b201.session?.guests).toBe(1);
    expect(b201.requests).toHaveLength(1);

    // Housekeeping states; a room of another hotel is out of reach.
    await setHousekeeping(db, hotel, r102.id, "out_of_order");
    await expect(setHousekeeping(db, hotel, r102.id, "sparkling")).rejects.toThrow();
    const other = await hotelOwner("Other rooms hotel");
    await expect(setHousekeeping(db, other, r102.id, "clean")).rejects.toMatchObject({ code: "NOT_FOUND" });

    // The guest asked for housekeeping: once done, the room is clean.
    await setHousekeeping(db, hotel, r201.id, "dirty");
    const req = b201.requests[0]!;
    await moveRequest(db, hotel, req.id, "in_progress");
    await moveRequest(db, hotel, req.id, "done");
    board = await roomsBoard(db, hotel);
    expect(board.rooms.find((r) => r.id === r201.id)?.housekeeping).toBe("clean");

    const today = await hotelToday(db, hotel);
    expect(today).toMatchObject({ rooms: 5, outOfOrder: 1, occupied: 1, doneToday: 1 });
    expect(today.avgResponseMin).not.toBeNull();

    // Check-out closes the visit and sends the room to housekeeping.
    await checkOutRoom(db, hotel, r201.id);
    board = await roomsBoard(db, hotel);
    const after = board.rooms.find((r) => r.id === r201.id)!;
    expect(after.session).toBeNull();
    expect(after.housekeeping).toBe("dirty");
    expect((await hotelToday(db, hotel)).dirty).toBe(1);
  });
});
