import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { diners, orders } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { saveZone } from "@/server/modules/delivery/service";
import { createCoupon } from "@/server/modules/customers/service";
import {
  getOnlineOrder,
  getOnlineStore,
  placeOnlineOrder,
  updateOnlineSettings,
} from "@/server/modules/online/service";
import { createOwnerWithRestaurant } from "../helpers/factories";

async function diner() {
  const phone = `0937${String(randomInt(1_000_000, 9_999_999))}`;
  const [d] = await db.insert(diners).values({ phone, phoneVerifiedAt: new Date() }).returning();
  return { id: d!.id, phone };
}

async function setup(opts: { delivery?: boolean } = {}) {
  const o = await createOwnerWithRestaurant("Online");
  const cat = await createCategory(db, o.ctx, { name: "Plats" });
  const dish = await createProduct(db, o.ctx, {
    categoryId: cat.id,
    name: "Kebab",
    priceCents: 1000,
    deliveryPriceCents: 1200,
  });
  const zone = await saveZone(db, o.ctx, null, { name: "Centre", feeCents: 300, minOrderCents: 2000 });
  await updateOnlineSettings(db, o.ctx, {
    onlineOrderingEnabled: true,
    onlineTakeaway: true,
    onlineDelivery: opts.delivery ?? true,
  });
  return { ...o, dish, zone, slug: o.restaurant.slug };
}

describe("online ordering", () => {
  it("is off until the restaurant turns it on", async () => {
    const o = await createOwnerWithRestaurant("Closed");
    expect(await getOnlineStore(db, o.restaurant.slug)).toBeNull();
    await expect(
      placeOnlineOrder(db, await diner(), o.restaurant.slug, {
        channel: "takeaway",
        lines: [{ productId: "01a12d2c-f1e7-7ccc-b9df-0449db8f6b05", quantity: 1 }],
        customerName: "Ali",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("takeaway: lands as received with the verified phone, the guest can follow it", async () => {
    const { slug, dish, restaurant } = await setup();
    const d = await diner();
    const store = await getOnlineStore(db, slug);
    expect(store).toMatchObject({ takeaway: true, delivery: true });
    const order = await placeOnlineOrder(db, d, slug, {
      channel: "takeaway",
      lines: [{ productId: dish.id, quantity: 2 }],
      customerName: "Ali",
    });
    expect(order).toMatchObject({
      status: "received",
      channel: "takeaway",
      totalCents: 2000,
      customerPhone: d.phone,
      dinerId: d.id,
      restaurantId: restaurant.id,
    });
    expect(await getOnlineOrder(db, d.id, slug, order.id)).toMatchObject({
      items: [{ name: "Kebab", quantity: 2 }],
    });
    // Somebody else's order stays private.
    expect(await getOnlineOrder(db, (await diner()).id, slug, order.id)).toBeNull();
  });

  it("delivery: delivery price list, zone fee and minimum, coupon", async () => {
    const { slug, dish, zone, ctx } = await setup();
    const d = await diner();
    await expect(
      placeOnlineOrder(db, d, slug, {
        channel: "delivery",
        lines: [{ productId: dish.id, quantity: 1 }],
        customerName: "Sara",
        deliveryAddress: "12 rue Vali-Asr, 3e étage",
        deliveryZoneId: zone.id,
      }),
    ).rejects.toMatchObject({ message: "below_zone_minimum" });
    await createCoupon(db, ctx, { code: "WIN-TEST", kind: "amount", value: 400, maxUses: 1 });
    const order = await placeOnlineOrder(db, d, slug, {
      channel: "delivery",
      lines: [{ productId: dish.id, quantity: 2 }],
      customerName: "Sara",
      deliveryAddress: "12 rue Vali-Asr, 3e étage",
      deliveryZoneId: zone.id,
      couponCode: "win-test",
    });
    // 2 × 1200 (delivery price) − 400 + 300 fee.
    expect(order).toMatchObject({
      channel: "delivery",
      deliveryFeeCents: 300,
      discountCents: 400,
      totalCents: 2300,
    });
    await expect(
      placeOnlineOrder(db, d, slug, {
        channel: "delivery",
        lines: [{ productId: dish.id, quantity: 2 }],
        customerName: "Sara",
        deliveryAddress: "12 rue Vali-Asr",
        deliveryZoneId: zone.id,
        couponCode: "WIN-TEST",
      }),
    ).rejects.toMatchObject({ message: "coupon_invalid" });
  });

  it("refuses a disabled mode, a guest without phone, and caps waiting orders", async () => {
    const { slug, dish } = await setup({ delivery: false });
    const d = await diner();
    await expect(
      placeOnlineOrder(db, { id: d.id, phone: null }, slug, {
        channel: "takeaway",
        lines: [{ productId: dish.id, quantity: 1 }],
        customerName: "Ali",
      }),
    ).rejects.toMatchObject({ message: "phone_required" });
    await expect(
      placeOnlineOrder(db, d, slug, {
        channel: "delivery",
        lines: [{ productId: dish.id, quantity: 3 }],
        customerName: "Ali",
        deliveryAddress: "somewhere far",
      }),
    ).rejects.toMatchObject({ message: "channel_disabled" });
    const line = { channel: "takeaway", lines: [{ productId: dish.id, quantity: 1 }], customerName: "Ali" };
    await placeOnlineOrder(db, d, slug, line);
    await placeOnlineOrder(db, d, slug, line);
    await expect(placeOnlineOrder(db, d, slug, line)).rejects.toMatchObject({ message: "too_many_pending" });
    const mine = await db.select().from(orders).where(eq(orders.dinerId, d.id));
    expect(mine).toHaveLength(2);
  });
});
