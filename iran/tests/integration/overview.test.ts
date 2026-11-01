import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { reservations } from "@/server/db/schema";
import { getOverviewLive } from "@/server/modules/dashboard/service";
import { weekCounts } from "@/server/modules/reservations/service";
import { localDay } from "@/lib/period";
import { randomToken } from "@/lib/ids";
import { createOwnerWithRestaurant } from "../helpers/factories";

describe("dashboard overview", () => {
  it("counts today's bookings and covers per restaurant, without cancelled ones or the queue", async () => {
    const a = await createOwnerWithRestaurant("Overview A");
    const b = await createOwnerWithRestaurant("Overview B");
    const now = new Date();
    const row = (status: string, partySize: number, kind = "booking") => ({
      restaurantId: a.restaurant.id,
      code: randomToken().slice(0, 12),
      name: `Guest ${partySize}`,
      phone: "09120000000",
      partySize,
      startsAt: now,
      status,
      kind,
    });
    await db
      .insert(reservations)
      .values([
        row("confirmed", 4),
        row("pending", 2),
        row("cancelled", 3),
        row("no_show", 5),
        row("confirmed", 6, "queue"),
      ]);

    const live = await getOverviewLive(db, a.ctx);
    expect(live.bookingsToday).toBe(2);
    expect(live.coversToday).toBe(6);
    expect(live.pendingBookings).toBe(1);
    expect(live.bookings.map((x) => x.partySize).sort()).toEqual([2, 4]);
    expect(live.active).toEqual([]);
    expect(live.top).toEqual([]);

    const today = localDay(now, a.ctx.restaurant.timezone);
    expect((await weekCounts(db, a.ctx, today)).get(today)).toEqual({ bookings: 2, covers: 6 });

    const other = await getOverviewLive(db, b.ctx);
    expect(other.bookingsToday).toBe(0);
    expect(other.bookings).toEqual([]);
  });
});
