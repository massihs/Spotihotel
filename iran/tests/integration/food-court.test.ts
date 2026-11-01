import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { orders, restaurants } from "@/server/db/schema";
import { setSmsDriver, type SmsDriver } from "@/server/infra/sms";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createTable } from "@/server/modules/tables/service";
import { enterTableByQr, loadGuestContext } from "@/server/modules/guest/sessions";
import { addToCart } from "@/server/modules/cart/service";
import { placeOrder, updateOrderStatus } from "@/server/modules/orders/service";
import { loadRestaurantContext } from "@/server/tenancy";
import { normalizeIranMobile } from "@/lib/phone";
import { createOwnerWithRestaurant } from "../helpers/factories";

const sent: { to: string; text: string }[] = [];
const fakeSms: SmsDriver = {
  name: "fake",
  async send(to, text) {
    sent.push({ to, text });
    return { ref: "1" };
  },
};

async function setup(kind: "restaurant" | "food_court") {
  const owner = await createOwnerWithRestaurant("Food Hall");
  await db.update(restaurants).set({ kind }).where(eq(restaurants.id, owner.restaurant.id));
  const ctx = await loadRestaurantContext(db, owner.sessionUser, owner.restaurant.id);
  const table = await createTable(db, ctx, { label: "K1" });
  const cat = await createCategory(db, ctx, { name: "Burgers" });
  const burger = await createProduct(db, ctx, { categoryId: cat.id, name: "Burger", priceCents: 2000 });
  const guestId = randomUUID();
  const e = await enterTableByQr(db, table.qrToken, guestId);
  const guest = (await loadGuestContext(db, guestId, e!.participant.id))!;
  await addToCart(db, guest, { productId: burger.id });
  return { ctx, guest };
}

afterEach(() => {
  setSmsDriver(null);
  sent.length = 0;
});

describe("Iranian mobile numbers", () => {
  it("normalizes prefixes and Persian digits", () => {
    expect(normalizeIranMobile("۰۹۱۲ ۳۴۵ ۶۷۸۹")).toBe("09123456789");
    expect(normalizeIranMobile("+98 912-345-6789")).toBe("09123456789");
    expect(normalizeIranMobile("9123456789")).toBe("09123456789");
    expect(normalizeIranMobile("02112345678")).toBeNull();
  });
});

describe("food court ready SMS", () => {
  it("requires a mobile number at checkout", async () => {
    const { guest } = await setup("food_court");
    await expect(placeOrder(db, guest, {})).rejects.toMatchObject({ message: "phone_required" });
    await expect(placeOrder(db, guest, { phone: "123" })).rejects.toMatchObject({ message: "invalid_phone" });
  });

  it("texts the guest once when the order is ready", async () => {
    setSmsDriver(fakeSms);
    const { ctx, guest } = await setup("food_court");
    const o = await placeOrder(db, guest, { phone: "۰۹۱۲۳۴۵۶۷۸۹" });
    expect(o.customerPhone).toBe("09123456789");
    await updateOrderStatus(db, ctx, o.id, "ready");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("09123456789");
    expect(sent[0]!.text).toContain(o.number);
    const [row] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(row!.readySmsSentAt).not.toBeNull();
    await updateOrderStatus(db, ctx, o.id, "served");
    expect(sent).toHaveLength(1);
  });

  it("does not text guests of a regular restaurant", async () => {
    setSmsDriver(fakeSms);
    const { ctx, guest } = await setup("restaurant");
    const o = await placeOrder(db, guest, { phone: "09123456789" });
    await updateOrderStatus(db, ctx, o.id, "ready");
    expect(sent).toHaveLength(0);
  });
});
