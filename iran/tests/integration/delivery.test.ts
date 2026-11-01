import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { orders } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createPosOrder } from "@/server/modules/pos/service";
import { lookupCustomer } from "@/server/modules/customers/service";
import {
  courierBalances,
  courierStats,
  createCourier,
  dispatchOrder,
  listDeliveries,
  markDelivered,
  saveZone,
  settleCourier,
} from "@/server/modules/delivery/service";
import { createOwnerWithRestaurant } from "../helpers/factories";

const key = () => randomBytes(12).toString("hex");

describe("delivery", () => {
  it("rings up, dispatches, delivers and settles a courier", async () => {
    const { ctx } = await createOwnerWithRestaurant("Pizza");
    const cat = await createCategory(db, ctx, { name: "Pizza" });
    const pizza = await createProduct(db, ctx, { categoryId: cat.id, name: "Margherita", priceCents: 1000 });
    const zone = await saveZone(db, ctx, null, { name: "Zone 1", feeCents: 150, minOrderCents: 500 });
    const courier = await createCourier(db, ctx, { name: "Reza" });

    await expect(
      createPosOrder(db, ctx, {
        channel: "delivery",
        lines: [{ productId: pizza.id, quantity: 1 }],
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ message: "phone_required" });

    const { order } = await createPosOrder(db, ctx, {
      channel: "delivery",
      lines: [{ productId: pizza.id, quantity: 2 }],
      customerPhone: "09121112233",
      customerName: "Sara",
      deliveryAddress: "Valiasr St, No 12, unit 4",
      deliveryZoneId: zone.id,
      idempotencyKey: key(),
    });
    expect(order.totalCents).toBe(2150);
    expect(order.deliveryFeeCents).toBe(150);

    // The address is remembered for the next call.
    const known = await lookupCustomer(db, ctx, "09121112233");
    expect(known.addresses.map((a) => a.address)).toEqual(["Valiasr St, No 12, unit 4"]);

    let board = await listDeliveries(db, ctx);
    expect(board.toAssign.map((o) => o.number)).toEqual([order.number]);
    await dispatchOrder(db, ctx, order.id, courier.id);
    board = await listDeliveries(db, ctx);
    expect(board.onTheRoad).toHaveLength(1);
    await markDelivered(db, ctx, order.id);

    const [bal] = await courierBalances(db, ctx);
    expect(bal).toMatchObject({ name: "Reza", deliveries: 1, collectCents: 2150 });
    expect(await settleCourier(db, ctx, courier.id)).toEqual({ orders: 1, amountCents: 2150 });
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o).toMatchObject({ paymentStatus: "paid", status: "served" });
    expect(o!.courierSettledAt).toBeInstanceOf(Date);
    await expect(settleCourier(db, ctx, courier.id)).rejects.toMatchObject({ message: "nothing_to_settle" });

    const [stat] = await courierStats(db, ctx, 1);
    expect(stat).toMatchObject({ name: "Reza", deliveries: 1, totalCents: 2150 });
  });
});
