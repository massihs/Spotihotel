import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { reservations, restaurantSettings } from "@/server/db/schema";
import { setSmsDriver } from "@/server/infra/sms";
import { createTable } from "@/server/modules/tables/service";
import {
  addToQueue,
  bookOnline,
  cancelByCode,
  getByCode,
  listDay,
  placeBySlug,
  sendDueReminders,
  setReservationStatus,
  slotsForDay,
} from "@/server/modules/reservations/service";
import { localDay } from "@/lib/period";
import { createOwnerWithRestaurant } from "../helpers/factories";

const sent: string[] = [];
afterEach(() => setSmsDriver(null));

describe("reservations", () => {
  it("books online within capacity, picks a table, reminds, queues and cancels", async () => {
    setSmsDriver({ name: "t", send: async (_to, text) => (sent.push(text), { ref: null }) });
    const { ctx, restaurant } = await createOwnerWithRestaurant("Booking");
    await db
      .update(restaurantSettings)
      .set({ reservationSlotCapacity: 6, openingHours: null })
      .where(eq(restaurantSettings.restaurantId, restaurant.id));
    const t4 = await createTable(db, ctx, { label: "4p", capacity: 4 });
    await createTable(db, ctx, { label: "2p", capacity: 2 });
    const place = (await placeBySlug(db, restaurant.slug))!;
    const tomorrow = localDay(new Date(Date.now() + 86_400_000), place.timezone);
    const slots = await slotsForDay(db, place, tomorrow, 4);
    expect(slots.length).toBeGreaterThan(5);
    const slot = slots[4]!;

    const b = await bookOnline(db, restaurant.slug, {
      name: "Sara",
      phone: "09121230000",
      partySize: 4,
      startsAt: slot.at.toISOString(),
    });
    expect(b).toMatchObject({ status: "confirmed", tableId: t4.id });
    expect(sent.at(-1)).toContain(b.code);

    // Capacity 6: a second party of 4 overlapping the slot is refused.
    await expect(
      bookOnline(db, restaurant.slug, {
        name: "Ali",
        phone: "09121230001",
        partySize: 4,
        startsAt: slot.at.toISOString(),
      }),
    ).rejects.toMatchObject({ message: "slot_unavailable" });

    // Reminder 1 hour before.
    const n = await sendDueReminders(db, restaurant.id, new Date(slot.at.getTime() - 3600_000));
    expect(n).toBe(1);
    expect(await sendDueReminders(db, restaurant.id, new Date(slot.at.getTime() - 3000_000))).toBe(0);

    // Queue: numbers, position, "table ready" SMS, seat.
    const q1 = await addToQueue(db, ctx, { name: "Reza", phone: "09121230002", partySize: 2 });
    const q2 = await addToQueue(db, ctx, { name: "Mina", phone: "09121230003", partySize: 3 });
    expect([q1.queueNumber, q2.queueNumber]).toEqual([1, 2]);
    expect((await getByCode(db, restaurant.slug, q2.code))!.ahead).toBe(1);
    await setReservationStatus(db, ctx, q1.id, "notified");
    expect(sent.at(-1)).toContain("Reza");
    await setReservationStatus(db, ctx, q1.id, "seated");
    expect((await getByCode(db, restaurant.slug, q2.code))!.ahead).toBe(0);
    const today = await listDay(db, ctx, localDay(new Date(), place.timezone));
    expect(today.queue).toHaveLength(2);

    await cancelByCode(db, restaurant.slug, b.code);
    const [row] = await db.select().from(reservations).where(eq(reservations.id, b.id));
    expect(row!.status).toBe("cancelled");
    await expect(setReservationStatus(db, ctx, b.id, "seated")).rejects.toMatchObject({
      message: "invalid_transition",
    });
  });
});
