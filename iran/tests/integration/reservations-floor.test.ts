import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { reservations, restaurantSettings } from "@/server/db/schema";
import { setSmsDriver } from "@/server/infra/sms";
import { createTable } from "@/server/modules/tables/service";
import { hostView, layoutTables, saveFloorPlan, seatWalkIn } from "@/server/modules/reservations/floor";
import { icsEvent } from "@/server/modules/reservations/ics";
import {
  bookOnline,
  createBooking,
  defaultWishTime,
  setReservationStatus,
  slotsNear,
} from "@/server/modules/reservations/service";
import { localDay, wallTime } from "@/lib/period";
import { FLOOR_COLS } from "@/lib/floor-plan";
import { createOwnerWithRestaurant } from "../helpers/factories";

afterEach(() => setSmsDriver(null));
const quiet = () => setSmsDriver({ name: "t", send: async () => ({ ref: null }) });

describe("floor plan and host stand", () => {
  it("lays out unplaced tables per zone without overlapping the placed ones", () => {
    const base = { capacity: 4, shape: "square" };
    const out = layoutTables([
      { ...base, id: "a", label: "A", zone: null, posX: 2, posY: 1 },
      { ...base, id: "b", label: "B", zone: null, posX: null, posY: null },
      { ...base, id: "c", label: "C", zone: " Terrasse ", posX: null, posY: null },
      ...Array.from({ length: 8 }, (_, i) => ({
        ...base,
        id: `x${i}`,
        label: `X${i}`,
        zone: null,
        posX: null,
        posY: null,
      })),
    ]);
    const a = out.find((t) => t.id === "a")!;
    expect(a).toMatchObject({ x: 2, y: 1, zoneKey: "" });
    // Auto-placed tables start below the placed ones and stay inside the grid.
    const main = out.filter((t) => t.zoneKey === "" && t.id !== "a");
    for (const t of main) {
      expect(t.y).toBeGreaterThanOrEqual(a.y + a.h + 1);
      expect(t.x + t.w).toBeLessThanOrEqual(FLOOR_COLS);
    }
    const overlap = (p: (typeof out)[number], q: (typeof out)[number]) =>
      p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
    for (const p of main) for (const q of main) if (p !== q) expect(overlap(p, q)).toBe(false);
    // Each zone has its own plan.
    expect(out.find((t) => t.id === "c")).toMatchObject({ zoneKey: "Terrasse", x: 1, y: 1 });
  });

  it("saves the plan, seats walk-ins once per table and keeps rooms off the plan", async () => {
    quiet();
    const { ctx, restaurant } = await createOwnerWithRestaurant("Floor");
    await db
      .update(restaurantSettings)
      .set({ reservationSlotCapacity: 40, openingHours: null })
      .where(eq(restaurantSettings.restaurantId, restaurant.id));
    const t2 = await createTable(db, ctx, { label: "T2", capacity: 2 });
    const t4 = await createTable(db, ctx, { label: "T4", capacity: 4, zone: "Terrasse" });
    await createTable(db, ctx, { label: "101", kind: "room", capacity: 2 });

    await saveFloorPlan(db, ctx, [{ id: t4.id, x: 10, y: 5, shape: "round" }]);
    await expect(saveFloorPlan(db, ctx, [{ id: t4.id, x: 99, y: 0, shape: "round" }])).rejects.toThrow();
    const day = localDay(new Date(), ctx.restaurant.timezone);
    const view = await hostView(db, ctx, day);
    expect(view.tables.map((t) => t.label).sort()).toEqual(["T2", "T4"]);
    expect(view.tables.find((t) => t.id === t4.id)).toMatchObject({ x: 10, y: 5, shape: "round" });

    // Walk-ins: no phone, seated now, one party per table.
    const w = await seatWalkIn(db, ctx, { tableId: t4.id, partySize: 3, name: "" }, "Walk-in");
    expect(w).toMatchObject({
      status: "seated",
      source: "walk_in",
      phone: "",
      name: "Walk-in",
      tableId: t4.id,
    });
    await expect(
      seatWalkIn(db, ctx, { tableId: t4.id, partySize: 2, name: "" }, "Walk-in"),
    ).rejects.toMatchObject({ message: "table_taken" });
    await expect(
      seatWalkIn(db, ctx, { tableId: t2.id, partySize: 3, name: "" }, "Walk-in"),
    ).rejects.toMatchObject({ message: "table_too_small" });
    // A second phone-less party elsewhere is not a "duplicate booking".
    await seatWalkIn(db, ctx, { tableId: t2.id, partySize: 2, name: "Reza" }, "Walk-in");

    // Seating a booking at a table someone already sits at is refused.
    const later = await createBooking(db, ctx, {
      name: "Sara",
      phone: "09121112233",
      partySize: 2,
      startsAt: new Date(Date.now() + 15 * 60_000),
      tableId: null,
    });
    await expect(setReservationStatus(db, ctx, later.id, "seated", t2.id)).rejects.toMatchObject({
      message: "table_taken",
    });
    const after = await hostView(db, ctx, day);
    expect(after.bookings.filter((b) => b.status === "seated")).toHaveLength(2);
  });
});

describe("guest booking flow", () => {
  it("offers the free times closest to the wished one, per restaurant", async () => {
    quiet();
    const a = await createOwnerWithRestaurant("Slots A");
    const b = await createOwnerWithRestaurant("Slots B");
    for (const r of [a, b])
      await db
        .update(restaurantSettings)
        .set({
          reservationSlotCapacity: 10,
          reservationDurationMin: 90,
          reservationMaxParty: 6,
          openingHours: null,
        })
        .where(eq(restaurantSettings.restaurantId, r.restaurant.id));
    const tz = a.ctx.restaurant.timezone;
    const day = localDay(new Date(Date.now() + 2 * 86_400_000), tz);
    // A full room at 20:00 in A (90 minutes: 20:00, 20:30 and 21:00 are gone).
    await createBooking(db, a.ctx, {
      name: "Big",
      phone: "09121119999",
      partySize: 10,
      startsAt: wallTime(day, "20:00", tz),
      tableId: null,
    });
    const near = await slotsNear(db, [a.restaurant.id, b.restaurant.id], {
      day,
      partySize: 2,
      time: "20:00",
    });
    expect(near.get(b.restaurant.id)!.map((s) => s.time)).toEqual([
      "19:00",
      "19:30",
      "20:00",
      "20:30",
      "21:00",
    ]);
    expect(near.get(a.restaurant.id)!.map((s) => s.time)).toEqual([
      "18:00",
      "18:30",
      "19:00",
      "19:30",
      "21:30",
    ]);
    // Larger than the place takes online: nothing to offer.
    const big = await slotsNear(db, [b.restaurant.id], { day, partySize: 8, time: "20:00" });
    expect(big.get(b.restaurant.id)).toEqual([]);

    // The occasion travels with the booking.
    const at = near.get(b.restaurant.id)![2]!.at;
    const r = await bookOnline(db, b.restaurant.slug, {
      name: "Mina",
      phone: "09121114455",
      partySize: 2,
      startsAt: at,
      occasion: "birthday",
    });
    const [row] = await db.select().from(reservations).where(eq(reservations.id, r.id));
    expect(row?.occasion).toBe("birthday");
  });

  it("guesses tonight's time and writes a valid calendar file", () => {
    const tz = "Asia/Tehran";
    expect(defaultWishTime(tz, new Date("2026-10-29T06:30:00Z"))).toBe("20:00"); // 10:00
    expect(defaultWishTime(tz, new Date("2026-10-29T17:40:00Z"))).toBe("22:00"); // 21:10
    expect(defaultWishTime(tz, new Date("2026-10-29T20:20:00Z"))).toBe("23:30"); // 23:50

    const ics = icsEvent({
      uid: "abc@spotifood",
      start: new Date("2026-10-30T16:30:00Z"),
      minutes: 90,
      title: "میز در رستوران خیلی خیلی خوب, با یک نام بسیار طولانی برای آزمایش تا خط بشکند",
      location: "Tehran; Vali-Asr",
      url: "https://example.test/r/x/b/abc",
      now: new Date("2026-10-29T00:00:00Z"),
    });
    expect(ics).toContain("DTSTART:20261030T163000Z\r\n");
    expect(ics).toContain("DTEND:20261030T180000Z\r\n");
    expect(ics).toContain("LOCATION:Tehran\\; Vali-Asr\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    // Folded lines join back to the original title (commas escaped).
    expect(ics.replace(/\r\n /g, "")).toContain("رستوران خیلی خیلی خوب\\, با");
  });
});
