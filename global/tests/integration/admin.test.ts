import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { orders } from "@/server/db/schema";
import { getPlatformStats, listRestaurantsForAdmin, listUsersForAdmin } from "@/server/modules/admin/service";
import { addMember, createOwnerWithRestaurant, createUser } from "../helpers/factories";

const order = (restaurantId: string, n: number) => ({
  restaurantId,
  number: `A-${n}`,
  seq: n,
  status: "served" as const,
  paymentStatus: "paid" as const,
  currency: "EUR",
  subtotalCents: 1000,
  taxCents: 91,
  totalCents: 1000,
});

describe("super admin listings", () => {
  it("counts orders per restaurant and restaurants per user correctly (correlated subqueries)", async () => {
    const a = await createOwnerWithRestaurant("Admin count A");
    const b = await createOwnerWithRestaurant("Admin count B");
    await db
      .insert(orders)
      .values([order(a.restaurant.id, 1), order(a.restaurant.id, 2), order(a.restaurant.id, 3)]);
    await db.insert(orders).values(order(b.restaurant.id, 1));

    const rows = await listRestaurantsForAdmin(db, { q: "Admin count" });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.ordersCount]));
    expect(byId[a.restaurant.id]).toBe(3);
    expect(byId[b.restaurant.id]).toBe(1);

    const staff = await createUser();
    await addMember(a.restaurant.id, staff.user.id, "staff");
    await addMember(b.restaurant.id, staff.user.id, "staff");
    const users = await listUsersForAdmin(db, { q: staff.user.email });
    expect(users[0]?.restaurantsCount).toBe(2);

    const stats = await getPlatformStats(db);
    expect(stats.orders).toBeGreaterThanOrEqual(4);
    expect(stats.revenueCents).toBeGreaterThanOrEqual(4000);
  });
});
