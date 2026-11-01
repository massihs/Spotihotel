import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { diningTables, tableSessions } from "@/server/db/schema";
import { nextCounterValue } from "@/server/modules/restaurants/service";
import { MemoryRateLimiter, enforceRateLimit } from "@/server/infra/rate-limit";
import { isUniqueViolation } from "@/server/db/errors";
import { randomToken } from "@/lib/ids";
import { createOwnerWithRestaurant } from "../helpers/factories";

describe("database invariants", () => {
  it("per-restaurant counters are atomic under concurrency", async () => {
    const { restaurant } = await createOwnerWithRestaurant();
    const values = await Promise.all(
      Array.from({ length: 25 }, () => nextCounterValue(db, restaurant.id, "order")),
    );
    expect(new Set(values).size).toBe(25);
    expect(Math.min(...values)).toBe(1000);
    expect(Math.max(...values)).toBe(1024);
  });

  it("counters are independent per restaurant", async () => {
    const a = await createOwnerWithRestaurant();
    const b = await createOwnerWithRestaurant();
    expect(await nextCounterValue(db, a.restaurant.id, "invoice", 1)).toBe(1);
    expect(await nextCounterValue(db, b.restaurant.id, "invoice", 1)).toBe(1);
    expect(await nextCounterValue(db, a.restaurant.id, "invoice", 1)).toBe(2);
  });

  it("allows only one open session per table", async () => {
    const { restaurant } = await createOwnerWithRestaurant();
    const [table] = await db
      .insert(diningTables)
      .values({ restaurantId: restaurant.id, label: "12", qrToken: randomToken() })
      .returning();
    await db.insert(tableSessions).values({ restaurantId: restaurant.id, tableId: table!.id });
    const err = await db
      .insert(tableSessions)
      .values({ restaurantId: restaurant.id, tableId: table!.id })
      .catch((e: unknown) => e);
    expect(isUniqueViolation(err, "table_sessions_one_open_per_table_uq")).toBe(true);
    // A closed session does not block a new open one.
    await db
      .insert(tableSessions)
      .values({ restaurantId: restaurant.id, tableId: table!.id, status: "closed", closedAt: new Date() });
  });

  it("table labels are unique per restaurant (case-insensitive) but reusable across tenants", async () => {
    const a = await createOwnerWithRestaurant();
    const b = await createOwnerWithRestaurant();
    await db
      .insert(diningTables)
      .values({ restaurantId: a.restaurant.id, label: "Terrasse", qrToken: randomToken() });
    await db
      .insert(diningTables)
      .values({ restaurantId: b.restaurant.id, label: "Terrasse", qrToken: randomToken() });
    const err = await db
      .insert(diningTables)
      .values({ restaurantId: a.restaurant.id, label: "terrasse", qrToken: randomToken() })
      .catch((e: unknown) => e);
    expect(isUniqueViolation(err)).toBe(true);
  });
});

describe("rate limiting", () => {
  it("blocks after the limit within the window", async () => {
    const limiter = new MemoryRateLimiter();
    for (let i = 0; i < 10; i++) await enforceRateLimit("login", "ip:mail", limiter);
    await expect(enforceRateLimit("login", "ip:mail", limiter)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    await expect(enforceRateLimit("login", "other", limiter)).resolves.toBeUndefined();
  });
});
