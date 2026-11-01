import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { coupons, customers } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import {
  adjustPoints,
  countAudience,
  createCoupon,
  getCustomer,
  sendCampaign,
  updateLoyaltySettings,
} from "@/server/modules/customers/service";
import { createPosOrder } from "@/server/modules/pos/service";
import { updateOrderStatus } from "@/server/modules/orders/service";
import { setSmsDriver } from "@/server/infra/sms";
import { createOwnerWithRestaurant } from "../helpers/factories";

const key = () => randomBytes(12).toString("hex");
const PHONE = "09121234567";

describe("customer club", () => {
  it("earns and redeems points, applies coupons and reverses on cancel", async () => {
    const { ctx } = await createOwnerWithRestaurant("Club");
    await updateLoyaltySettings(db, ctx, { enabled: true, spendPerPointCents: 100, pointValueCents: 10 });
    const cat = await createCategory(db, ctx, { name: "Plats" });
    const dish = await createProduct(db, ctx, { categoryId: cat.id, name: "Kebab", priceCents: 1000 });

    // Paid sale with a phone → customer created, 10 points earned.
    await createPosOrder(db, ctx, {
      lines: [{ productId: dish.id, quantity: 1 }],
      customerPhone: "۰۹۱۲۱۲۳۴۵۶۷",
      customerName: "Sara",
      payment: { provider: "cash" },
      idempotencyKey: key(),
    });
    let [c] = await db.select().from(customers).where(eq(customers.phone, PHONE));
    expect(c).toMatchObject({ name: "Sara", points: 10, ordersCount: 1, totalSpentCents: 1000 });

    // 20% coupon then 5 points (50) → 1000 - 200 - 50 = 750.
    await createCoupon(db, ctx, { code: "nowruz", kind: "percent", value: 20, maxUses: 1 });
    const { order } = await createPosOrder(db, ctx, {
      lines: [{ productId: dish.id, quantity: 1 }],
      customerPhone: PHONE,
      couponCode: "NOWRUZ",
      redeemPoints: 5,
      payment: { provider: "cash" },
      idempotencyKey: key(),
    });
    expect(order.totalCents).toBe(750);
    [c] = await db.select().from(customers).where(eq(customers.id, c!.id));
    expect(c!.points).toBe(10 - 5 + 7);
    const [cp] = await db.select().from(coupons).where(eq(coupons.code, "NOWRUZ"));
    expect(cp!.usedCount).toBe(1);

    // The coupon is used up.
    await expect(
      createPosOrder(db, ctx, {
        lines: [{ productId: dish.id, quantity: 1 }],
        couponCode: "NOWRUZ",
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ message: "coupon_invalid" });

    // Cancelling gives the points and the coupon back, and removes what it earned.
    await updateOrderStatus(db, ctx, order.id, "cancelled");
    [c] = await db.select().from(customers).where(eq(customers.id, c!.id));
    expect(c!.points).toBe(10);
    expect(c!.totalSpentCents).toBe(1000);
    const [cp2] = await db.select().from(coupons).where(eq(coupons.id, cp!.id));
    expect(cp2!.usedCount).toBe(0);

    await adjustPoints(db, ctx, c!.id, -4);
    const file = await getCustomer(db, ctx, c!.id);
    expect(file.customer.points).toBe(6);
    expect(file.orders).toHaveLength(2);
    await expect(adjustPoints(db, ctx, c!.id, -100)).rejects.toMatchObject({
      message: "points_insufficient",
    });
  });

  it("texts a campaign to customers who did not opt out", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant("Club");
    await db.insert(customers).values([
      { restaurantId: restaurant.id, phone: "09120000001" },
      { restaurantId: restaurant.id, phone: "09120000002" },
      { restaurantId: restaurant.id, phone: "09120000003", smsOptOut: true },
    ]);
    const sent: string[] = [];
    setSmsDriver({ name: "test", send: async (to) => (sent.push(to), { ref: null }) });
    try {
      expect((await countAudience(db, ctx)).all).toBe(2);
      const res = await sendCampaign(db, ctx, { message: "۲۰٪ تخفیف آخر هفته", audience: "all" });
      expect(res).toEqual({ recipients: 2, sent: 2 });
      expect(sent.sort()).toEqual(["09120000001", "09120000002"]);
    } finally {
      setSmsDriver(null);
    }
  });
});
