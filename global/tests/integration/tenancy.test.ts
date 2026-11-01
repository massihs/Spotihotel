import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { diningTables, restaurants } from "@/server/db/schema";
import { assertCan, listUserRestaurants, loadRestaurantContext } from "@/server/tenancy";
import { getSetupOverview } from "@/server/modules/dashboard/service";
import { setRestaurantStatus } from "@/server/modules/restaurants/service";
import { randomToken } from "@/lib/ids";
import { addMember, createOwnerWithRestaurant, createUser } from "../helpers/factories";

describe("tenant isolation", () => {
  it("an owner of A cannot load restaurant B (404, not 403)", async () => {
    const a = await createOwnerWithRestaurant("Alpha");
    const b = await createOwnerWithRestaurant("Beta");
    await expect(loadRestaurantContext(db, a.sessionUser, b.restaurant.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const ctx = await loadRestaurantContext(db, a.sessionUser, a.restaurant.id);
    expect(ctx.restaurant.id).toBe(a.restaurant.id);
    expect(ctx.role).toBe("owner");
  });

  it("returns 404 for malformed and unknown ids", async () => {
    const a = await createOwnerWithRestaurant();
    await expect(loadRestaurantContext(db, a.sessionUser, "not-a-uuid")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      loadRestaurantContext(db, a.sessionUser, "00000000-0000-7000-8000-000000000000"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists only the restaurants a user belongs to", async () => {
    const a = await createOwnerWithRestaurant("Gamma");
    await createOwnerWithRestaurant("Delta");
    const list = await listUserRestaurants(db, a.user.id);
    expect(list.map((r) => r.id)).toEqual([a.restaurant.id]);
  });

  it("scopes dashboard counts to the current tenant", async () => {
    const a = await createOwnerWithRestaurant();
    const b = await createOwnerWithRestaurant();
    await db.insert(diningTables).values(
      Array.from({ length: 3 }, (_, i) => ({
        restaurantId: b.restaurant.id,
        label: `T${i}`,
        qrToken: randomToken(),
      })),
    );
    await db
      .insert(diningTables)
      .values({ restaurantId: a.restaurant.id, label: "1", qrToken: randomToken() });
    const ctxA = await loadRestaurantContext(db, a.sessionUser, a.restaurant.id);
    const ctxB = await loadRestaurantContext(db, b.sessionUser, b.restaurant.id);
    expect((await getSetupOverview(db, ctxA)).tables).toBe(1);
    expect((await getSetupOverview(db, ctxB)).tables).toBe(3);
  });
});

describe("roles and permissions", () => {
  it("staff get service permissions only", async () => {
    const a = await createOwnerWithRestaurant();
    const staff = await createUser();
    await addMember(a.restaurant.id, staff.user.id, "staff");
    const ctx = await loadRestaurantContext(db, staff.sessionUser, a.restaurant.id);
    expect(ctx.role).toBe("staff");
    expect(() => assertCan(ctx, "orders.update_status")).not.toThrow();
    expect(() => assertCan(ctx, "menu.manage")).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("honours per-member granted / revoked permissions", async () => {
    const a = await createOwnerWithRestaurant();
    const staff = await createUser();
    await addMember(a.restaurant.id, staff.user.id, "staff", {
      granted: ["menu.manage"],
      revoked: ["payments.record"],
    });
    const ctx = await loadRestaurantContext(db, staff.sessionUser, a.restaurant.id);
    expect(ctx.permissions.has("menu.manage")).toBe(true);
    expect(ctx.permissions.has("payments.record")).toBe(false);
  });

  it("disabled members lose access", async () => {
    const a = await createOwnerWithRestaurant();
    const staff = await createUser();
    await addMember(a.restaurant.id, staff.user.id, "staff", { status: "disabled" });
    await expect(loadRestaurantContext(db, staff.sessionUser, a.restaurant.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("super admins can access any restaurant, flagged as such", async () => {
    const a = await createOwnerWithRestaurant();
    const admin = await createUser({ superAdmin: true });
    const ctx = await loadRestaurantContext(db, admin.sessionUser, a.restaurant.id);
    expect(ctx.viaSuperAdmin).toBe(true);
    expect(ctx.permissions.has("menu.manage")).toBe(true);
  });
});

describe("suspension", () => {
  it("blocks members of a suspended restaurant but not super admins", async () => {
    const a = await createOwnerWithRestaurant();
    const admin = await createUser({ superAdmin: true });
    await setRestaurantStatus(db, a.restaurant.id, "suspended", "unpaid");
    await expect(loadRestaurantContext(db, a.sessionUser, a.restaurant.id)).rejects.toMatchObject({
      code: "TENANT_SUSPENDED",
    });
    await expect(loadRestaurantContext(db, admin.sessionUser, a.restaurant.id)).resolves.toBeTruthy();

    await setRestaurantStatus(db, a.restaurant.id, "active");
    const [r] = await db.select().from(restaurants).where(eq(restaurants.id, a.restaurant.id));
    expect(r?.suspendedReason).toBeNull();
    await expect(loadRestaurantContext(db, a.sessionUser, a.restaurant.id)).resolves.toBeTruthy();
  });
});
