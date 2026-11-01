import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createPosOrder } from "@/server/modules/pos/service";
import { deleteStation, getTicket, listStations, saveStation } from "@/server/modules/kitchen/stations";
import { createOwnerWithRestaurant } from "../helpers/factories";

describe("kitchen stations", () => {
  it("routes categories to stations and prints per-station tickets", async () => {
    const { ctx } = await createOwnerWithRestaurant("Grill");
    const kebabs = await createCategory(db, ctx, { name: "Kebab" });
    const drinks = await createCategory(db, ctx, { name: "Drinks" });
    const k = await createProduct(db, ctx, { categoryId: kebabs.id, name: "Koobideh", priceCents: 1500 });
    const d = await createProduct(db, ctx, { categoryId: drinks.id, name: "Doogh", priceCents: 300 });
    const grill = await saveStation(db, ctx, null, {
      name: "Grill",
      color: "orange",
      categoryIds: [kebabs.id],
    });
    const bar = await saveStation(db, ctx, null, { name: "Bar", color: "sky", categoryIds: [drinks.id] });

    const { order } = await createPosOrder(db, ctx, {
      lines: [
        { productId: k.id, quantity: 2 },
        { productId: d.id, quantity: 1 },
      ],
      idempotencyKey: randomBytes(12).toString("hex"),
    });
    expect((await getTicket(db, ctx, order.id, grill)).items.map((i) => i.productName)).toEqual(["Koobideh"]);
    expect((await getTicket(db, ctx, order.id, bar)).items.map((i) => i.productName)).toEqual(["Doogh"]);
    expect((await getTicket(db, ctx, order.id, null)).items).toHaveLength(2);

    // Moving a category to another station, then deleting the station frees its categories.
    await saveStation(db, ctx, bar, { name: "Bar", color: "sky", categoryIds: [drinks.id, kebabs.id] });
    let setup = await listStations(db, ctx);
    expect(setup.categories.find((c) => c.id === kebabs.id)?.stationId).toBe(bar);
    await deleteStation(db, ctx, bar);
    setup = await listStations(db, ctx);
    expect(setup.stations.map((s) => s.name)).toEqual(["Grill"]);
    expect(setup.categories.every((c) => c.stationId === null)).toBe(true);
  });
});
