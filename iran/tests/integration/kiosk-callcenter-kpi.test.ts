import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { notifications, orders } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { getKioskStore, placeKioskOrder, updateKiosk } from "@/server/modules/online/service";
import { createBranch } from "@/server/modules/branches/service";
import { createPosOrder } from "@/server/modules/pos/service";
import { updateOrderStatus } from "@/server/modules/orders/service";
import { callCenterLookup } from "@/server/modules/callcenter/service";
import { checkKpiAlerts, getKpiStatus, updateKpiGoals } from "@/server/modules/kpi/service";
import { contextFor, createOwnerWithRestaurant } from "../helpers/factories";

async function withDish(name = "Kiosk") {
  const o = await createOwnerWithRestaurant(name, { plan: "professional" });
  const cat = await createCategory(db, o.ctx, { name: "Plats" });
  const dish = await createProduct(db, o.ctx, { categoryId: cat.id, name: "Kebab", priceCents: 1000 });
  return { ...o, dish };
}

describe("kiosk", () => {
  it("orders without sign-in through its private link, eat in or take away", async () => {
    const { ctx, dish } = await withDish();
    const { token } = await updateKiosk(db, ctx, { enabled: true });
    expect(await getKioskStore(db, token)).toMatchObject({ id: ctx.restaurant.id });
    const o = await placeKioskOrder(db, token, {
      channel: "dine_in",
      lines: [{ productId: dish.id, quantity: 2 }],
      customerName: "Reza",
      phone: "",
    });
    expect(o).toMatchObject({
      status: "received",
      channel: "dine_in",
      totalCents: 2000,
      customerPhone: null,
    });

    // A new link cuts off the old tablets; turning it off closes the kiosk.
    const again = await updateKiosk(db, ctx, { enabled: true, regenerate: true });
    expect(again.token).not.toBe(token);
    expect(await getKioskStore(db, token)).toBeNull();
    await updateKiosk(db, ctx, { enabled: false });
    await expect(
      placeKioskOrder(db, again.token, {
        channel: "takeaway",
        lines: [{ productId: dish.id, quantity: 1 }],
        customerName: "R",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("call centre", () => {
  it("finds the caller in every branch of the group", async () => {
    const { ctx, sessionUser, dish } = await withDish("Group");
    const branch = await createBranch(db, ctx, { name: "Branch 2" });
    const bctx = await contextFor(sessionUser, branch.id);
    const phone = "09381234567";
    await createPosOrder(db, bctx, {
      lines: [
        {
          productId: (
            await createProduct(db, bctx, {
              categoryId: (await createCategory(db, bctx, { name: "X" })).id,
              name: "Doogh",
              priceCents: 300,
            })
          ).id,
          quantity: 1,
        },
      ],
      customerPhone: phone,
      customerName: "Mina",
      channel: "delivery",
      deliveryAddress: "Vanak, 12th street",
      idempotencyKey: randomBytes(12).toString("hex"),
    });
    void dish;
    const res = await callCenterLookup(db, ctx, "۰۹۳۸۱۲۳۴۵۶۷");
    expect(res.phone).toBe(phone);
    expect(res.branches).toHaveLength(2);
    expect(res.branches[0]).toMatchObject({ id: branch.id, customer: { name: "Mina", ordersCount: 1 } });
    expect(res.branches[0]!.customer!.addresses[0]!.address).toBe("Vanak, 12th street");
    expect(res.branches[0]!.orders).toHaveLength(1);
    expect(res.branches[1]).toMatchObject({ id: ctx.restaurant.id, customer: null });
    await expect(callCenterLookup(db, ctx, "123")).rejects.toMatchObject({ message: "invalid_phone" });
  });
});

describe("targets", () => {
  it("measures kitchen time and notifies once when it is too slow", async () => {
    const { ctx, dish } = await withDish("Goals");
    await updateKpiGoals(db, ctx, { dailyRevenueCents: 100_000, maxPrepMinutes: 10, minRating: null });
    const { order } = await createPosOrder(db, ctx, {
      lines: [{ productId: dish.id, quantity: 1 }],
      payment: { provider: "cash" },
      idempotencyKey: randomBytes(12).toString("hex"),
    });
    await updateOrderStatus(db, ctx, order.id, "ready");
    // Pretend it took 25 minutes.
    const now = new Date();
    await db
      .update(orders)
      .set({ acceptedAt: new Date(now.getTime() - 25 * 60_000), readyAt: now })
      .where(eq(orders.id, order.id));
    const k = await getKpiStatus(db, ctx);
    expect(Math.round(k.prepTodayMinutes!)).toBe(25);
    expect(k.revenueTodayCents).toBe(1000);
    expect(await checkKpiAlerts(db, ctx.restaurant)).toContain("kpi.prep_slow");
    expect(await checkKpiAlerts(db, ctx.restaurant)).not.toContain("kpi.prep_slow");
    const n = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.restaurantId, ctx.restaurant.id), eq(notifications.type, "kpi.prep_slow")));
    expect(n).toHaveLength(1);
  });
});
