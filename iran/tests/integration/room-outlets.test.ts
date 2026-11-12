import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { categories, orders, restaurants } from "@/server/db/schema";
import { addToCart, getCartView, switchCartOutlet } from "@/server/modules/cart/service";
import { enterTableByQr, loadGuestContext } from "@/server/modules/guest/sessions";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { placeOrder } from "@/server/modules/orders/service";
import { createOutlet, roomServiceOutlets, updateOutlet } from "@/server/modules/outlets/service";
import { bulkCreateTables, listTables } from "@/server/modules/tables/service";
import { createOwnerWithRestaurant } from "../helpers/factories";

describe("room service from every restaurant of the hotel", () => {
  it("lets a room order from any outlet open to rooms, one kitchen per order", async () => {
    const { ctx } = await createOwnerWithRestaurant("Outlets Hotel", { plan: "enterprise" });
    await db.update(restaurants).set({ kind: "hotel" }).where(eq(restaurants.id, ctx.restaurant.id));
    const h = { ...ctx, restaurant: { ...ctx.restaurant, kind: "hotel" as const } };
    const main = await createOutlet(db, h, { name: "Shahrzad", kind: "restaurant", tables: 0 });
    const cafe = await createOutlet(db, h, { name: "Lobby café", kind: "cafe", tables: 0 });
    const bar = await createOutlet(db, h, { name: "Roof bar", kind: "bar", tables: 0 });
    // Every outlet is open to rooms by default; the manager closes the bar to them.
    expect((await roomServiceOutlets(db, h.restaurant.id)).map((o) => o.name)).toEqual([
      "Shahrzad",
      "Lobby café",
      "Roof bar",
    ]);
    await updateOutlet(db, h, bar.id, { name: "Roof bar", kind: "bar", roomService: false });
    expect((await roomServiceOutlets(db, h.restaurant.id)).map((o) => o.id)).toEqual([main.id, cafe.id]);

    const kebabs = await createCategory(db, h, { name: "Kebabs" });
    const coffee = await createCategory(db, h, { name: "Coffee" });
    const water = await createCategory(db, h, { name: "Water" });
    await db
      .update(categories)
      .set({ outletIds: [main.id] })
      .where(eq(categories.id, kebabs.id));
    await db
      .update(categories)
      .set({ outletIds: [cafe.id] })
      .where(eq(categories.id, coffee.id));
    const kebab = await createProduct(db, h, { categoryId: kebabs.id, name: "Kebab", priceCents: 50_000 });
    const latte = await createProduct(db, h, { categoryId: coffee.id, name: "Latte", priceCents: 20_000 });
    const still = await createProduct(db, h, { categoryId: water.id, name: "Water", priceCents: 5_000 });

    await bulkCreateTables(db, h, { from: 101, to: 101, kind: "room" });
    const room = (await listTables(db, h)).find((t) => t.kind === "room")!;
    const gid = randomUUID();
    const e = await enterTableByQr(db, room.qrToken, gid);
    const guest = (await loadGuestContext(db, gid, e!.participant.id))!;

    // From the restaurant: its own dish and a shared one; not the café's latte.
    await addToCart(db, guest, { productId: kebab.id, outletId: main.id });
    await addToCart(db, guest, { productId: still.id, outletId: main.id });
    await expect(addToCart(db, guest, { productId: latte.id, outletId: main.id })).rejects.toMatchObject({
      message: "product_other_outlet",
    });
    expect((await getCartView(db, guest)).outlet).toEqual({ id: main.id, name: "Shahrzad" });
    // The café while the cart holds the restaurant's dishes: refused until the guest switches.
    await expect(addToCart(db, guest, { productId: latte.id, outletId: cafe.id })).rejects.toMatchObject({
      message: "cart_other_outlet",
    });
    // The bar is closed to rooms: switching to it is refused.
    await expect(switchCartOutlet(db, guest, bar.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await switchCartOutlet(db, guest, cafe.id);
    expect((await getCartView(db, guest)).lines).toEqual([]);
    await addToCart(db, guest, { productId: latte.id, outletId: cafe.id });

    // The order goes to the café's kitchen and till.
    const order = await placeOrder(db, guest, {});
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row).toMatchObject({ outletId: cafe.id, placeKind: "room", tableLabel: room.label });
  });
});
