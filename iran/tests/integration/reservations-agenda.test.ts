import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { restaurantSettings } from "@/server/db/schema";
import { setSmsDriver } from "@/server/infra/sms";
import { createTable } from "@/server/modules/tables/service";
import {
  agendaDay,
  availability,
  createBooking,
  customerByPhone,
  updateBooking,
} from "@/server/modules/reservations/service";
import { localDay, wallTime } from "@/lib/period";
import { createOwnerWithRestaurant } from "../helpers/factories";

afterEach(() => setSmsDriver(null));

describe("reservations agenda", () => {
  it("never gives a table twice, refuses duplicates and full slots, and moves bookings safely", async () => {
    setSmsDriver({ name: "t", send: async () => ({ ref: null }) });
    const { ctx, restaurant } = await createOwnerWithRestaurant("Agenda");
    await db
      .update(restaurantSettings)
      .set({ reservationSlotCapacity: 10, reservationDurationMin: 90, openingHours: null })
      .where(eq(restaurantSettings.restaurantId, restaurant.id));
    const t2 = await createTable(db, ctx, { label: "T2", capacity: 2 });
    const t4 = await createTable(db, ctx, { label: "T4", capacity: 4 });
    const tz = ctx.restaurant.timezone;
    const day = localDay(new Date(Date.now() + 2 * 86_400_000), tz);
    const at = (time: string) => wallTime(day, time, tz);

    // Phone booking on T4 at 20:00, stored at the restaurant's wall-clock time.
    const a = await createBooking(db, ctx, {
      name: "Sara",
      phone: "09121110000",
      partySize: 4,
      startsAt: at("20:00"),
      tableId: t4.id,
    });
    expect(a).toMatchObject({ tableId: t4.id, durationMin: 90, source: "phone", status: "confirmed" });
    expect(new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeStyle: "short" }).format(a.startsAt)).toBe(
      "20:00",
    );

    // T4 is taken until 21:30, whoever asks.
    await expect(
      createBooking(db, ctx, {
        name: "Ali",
        phone: "09121110001",
        partySize: 2,
        startsAt: at("21:00"),
        tableId: t4.id,
      }),
    ).rejects.toMatchObject({ message: "table_taken" });
    // A table that is too small.
    await expect(
      createBooking(db, ctx, {
        name: "Ali",
        phone: "09121110001",
        partySize: 3,
        startsAt: at("20:00"),
        tableId: t2.id,
      }),
    ).rejects.toMatchObject({ message: "table_too_small" });
    // The same guest twice at overlapping times.
    await expect(
      createBooking(db, ctx, { name: "Sara", phone: "09121110000", partySize: 2, startsAt: at("20:30") }),
    ).rejects.toMatchObject({ message: "duplicate_booking" });

    // Automatic: the only free table that fits.
    const b = await createBooking(db, ctx, {
      name: "Ali",
      phone: "09121110001",
      partySize: 2,
      startsAt: at("20:30"),
    });
    expect(b.tableId).toBe(t2.id);
    // No table left for 4 more: 6 seats used of 10, a party of 5 without a table overflows.
    await expect(
      createBooking(db, ctx, { name: "Reza", phone: "09121110002", partySize: 5, startsAt: at("20:30") }),
    ).rejects.toMatchObject({ message: "slot_full" });
    const c = await createBooking(db, ctx, {
      name: "Reza",
      phone: "09121110002",
      partySize: 4,
      startsAt: at("20:30"),
    });
    expect(c.tableId).toBeNull();

    // Simultaneous requests for the same table: exactly one wins.
    const race = await Promise.allSettled(
      ["09121110003", "09121110004"].map((phone) =>
        createBooking(db, ctx, { name: "X", phone, partySize: 2, startsAt: at("12:00"), tableId: t2.id }),
      ),
    );
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    // What the form shows at 20:45 for 2 people.
    const av = await availability(db, ctx, { startsAt: at("20:45"), partySize: 2, phone: "09121110001" });
    expect(av.tables.find((x) => x.id === t4.id)).toMatchObject({
      state: "taken",
      takenBy: { name: "Sara" },
    });
    expect(av.duplicate?.name).toBe("Ali");
    expect(av.seatsLeft).toBe(0);

    // Moving Sara onto Ali's table is refused; moving her to 22:00 frees 20:00 and keeps T4.
    await expect(updateBooking(db, ctx, a.id, { tableId: t2.id, partySize: 2 })).rejects.toMatchObject({
      message: "table_taken",
    });
    const moved = await updateBooking(db, ctx, a.id, { startsAt: at("22:00") });
    expect(moved).toMatchObject({ tableId: t4.id, reminderSentAt: null });
    // Reza can now have T4 at 20:30 (his own booking is not counted against him).
    expect((await updateBooking(db, ctx, c.id, { tableId: t4.id })).tableId).toBe(t4.id);

    const agenda = await agendaDay(db, ctx, day);
    expect(agenda.tables.map((x) => x.label)).toEqual(["T2", "T4"]);
    expect(agenda.bookings).toHaveLength(4);
    expect(agenda.ranges).toEqual([{ open: 720, close: 1380 }]);

    expect(await customerByPhone(db, ctx, "09121110000")).toMatchObject({ name: "Sara", bookings: 1 });
  });
});
