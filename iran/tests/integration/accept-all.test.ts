import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { orders } from "@/server/db/schema";
import { addToCart } from "@/server/modules/cart/service";
import { enterTableByQr, loadGuestContext } from "@/server/modules/guest/sessions";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { acceptAllOrders, placeOrder, updateOrderStatus } from "@/server/modules/orders/service";
import { createTable } from "@/server/modules/tables/service";
import { loadRestaurantContext } from "@/server/tenancy";
import { createOwnerWithRestaurant } from "../helpers/factories";

describe("accept all orders", () => {
  it("accepts every new order at once (stamping acceptedAt), skips the others, then starts them all", async () => {
    const owner = await createOwnerWithRestaurant("Rush hour");
    const ctx = await loadRestaurantContext(db, owner.sessionUser, owner.restaurant.id);
    const table = await createTable(db, ctx, { label: "5" });
    const cat = await createCategory(db, ctx, { name: "Plats" });
    const dish = await createProduct(db, ctx, { categoryId: cat.id, name: "Kebab", priceCents: 1000 });
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const gid = randomUUID();
      const e = await enterTableByQr(db, table.qrToken, gid);
      const guest = (await loadGuestContext(db, gid, e!.participant.id))!;
      await addToCart(db, guest, { productId: dish.id });
      ids.push((await placeOrder(db, guest, {})).id);
    }
    // One was already taken by someone else.
    await updateOrderStatus(db, ctx, ids[0]!, "accepted");

    const res = await acceptAllOrders(db, ctx);
    expect(res).toEqual({ done: 2, skipped: 0 });
    const rows = await db.select().from(orders).where(inArray(orders.id, ids));
    expect(rows.every((o) => o.status === "accepted" && o.acceptedAt)).toBe(true);

    // Only the orders shown on the screen (e.g. one station), then "start all".
    const started = await acceptAllOrders(db, ctx, { from: "accepted", orderIds: [ids[1]!] });
    expect(started.done).toBe(1);
    const [one] = await db.select().from(orders).where(eq(orders.id, ids[1]!));
    expect(one).toMatchObject({ status: "preparing" });
    expect((await acceptAllOrders(db, ctx)).done).toBe(0);
  });
});
