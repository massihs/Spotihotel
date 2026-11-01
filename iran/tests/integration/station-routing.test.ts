import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { orderItems, printJobs } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createPosOrder } from "@/server/modules/pos/service";
import { savePrinter } from "@/server/modules/printing/service";
import {
  getTicket,
  isDrinkCategory,
  routingView,
  setCategoryStation,
  setProductStation,
  setupKitchenAndBar,
} from "@/server/modules/kitchen/stations";
import { createOwnerWithRestaurant } from "../helpers/factories";

const key = () => randomBytes(12).toString("hex");

describe("kitchen / bar routing", () => {
  it("recognises drinks in Persian, French and English", () => {
    for (const name of [
      "نوشیدنی گرم",
      "نوشیدنی سرد",
      "قهوه",
      "Boissons",
      "Cafés",
      "Soft drinks",
      "Jus de fruits",
    ])
      expect(isDrinkCategory({ name }), name).toBe(true);
    for (const name of ["پیتزا", "غذای اصلی", "Barbecue", "Desserts", "Salades"])
      expect(isDrinkCategory({ name }), name).toBe(false);
    expect(isDrinkCategory({ name: "Specials", templateKey: "coffee" })).toBe(true);
  });

  it("sets up Kitchen and Bar, lets a dish go elsewhere, and prints each line at its station", async () => {
    const { ctx } = await createOwnerWithRestaurant("Routing");
    const mains = await createCategory(db, ctx, { name: "غذای اصلی" });
    const drinks = await createCategory(db, ctx, { name: "نوشیدنی سرد" });
    const kebab = await createProduct(db, ctx, { categoryId: mains.id, name: "کباب", priceCents: 1500 });
    const doogh = await createProduct(db, ctx, { categoryId: drinks.id, name: "دوغ", priceCents: 300 });
    // A dessert made at the bar, though its category is the kitchen's.
    const affogato = await createProduct(db, ctx, { categoryId: mains.id, name: "آفوگاتو", priceCents: 500 });

    const setup = await setupKitchenAndBar(db, ctx, { kitchen: "آشپزخانه", bar: "بار" });
    expect(setup).toMatchObject({ toBar: 1, toKitchen: 1 });
    // Running it again reuses the same stations and leaves choices alone.
    const again = await setupKitchenAndBar(db, ctx, { kitchen: "آشپزخانه", bar: "بار" });
    expect(again).toMatchObject({ kitchen: setup.kitchen, bar: setup.bar, toBar: 0, toKitchen: 0 });

    await setProductStation(db, ctx, affogato.id, setup.bar);
    await savePrinter(db, ctx, null, {
      name: "Bar",
      host: "10.0.0.9",
      target: "station",
      stationId: setup.bar,
    });
    const view = await routingView(db, ctx);
    expect(view.stations.find((s) => s.id === setup.bar)?.printers).toEqual(["Bar"]);
    expect(view.products.find((p) => p.id === affogato.id)?.stationId).toBe(setup.bar);

    const { order } = await createPosOrder(db, ctx, {
      lines: [
        { productId: kebab.id, quantity: 1 },
        { productId: doogh.id, quantity: 2 },
        { productId: affogato.id, quantity: 1 },
      ],
      idempotencyKey: key(),
    });
    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const at = (name: string) => lines.find((l) => l.productName === name)?.stationId;
    expect(at("کباب")).toBe(setup.kitchen);
    expect(at("دوغ")).toBe(setup.bar);
    expect(at("آفوگاتو")).toBe(setup.bar);

    const bar = await getTicket(db, ctx, order.id, setup.bar);
    expect(bar.items.map((i) => i.productName).sort()).toEqual(["آفوگاتو", "دوغ"].sort());
    const kitchen = await getTicket(db, ctx, order.id, setup.kitchen);
    expect(kitchen.items.map((i) => i.productName)).toEqual(["کباب"]);
    // The bar printer gets a job; there is no kitchen printer.
    expect(await db.select().from(printJobs).where(eq(printJobs.orderId, order.id))).toHaveLength(1);

    // Moving the category later does not move a ticket already sent.
    await setCategoryStation(db, ctx, drinks.id, setup.kitchen);
    expect((await getTicket(db, ctx, order.id, setup.bar)).items).toHaveLength(2);
  });
});
