import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { diningTables, orders, restaurants } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { loadPublicMenu, menuForOutlet } from "@/server/modules/menu/public";
import { createPosOrder } from "@/server/modules/pos/service";
import {
  addOutletTables,
  archiveOutlet,
  createOutlet,
  listOutlets,
  setOutletMenu,
  updateOutlet,
} from "@/server/modules/outlets/service";
import { createOwnerWithRestaurant } from "../helpers/factories";

const key = () => randomBytes(12).toString("hex");

describe("hotel outlets (restaurants and cafés)", () => {
  it("opens outlets with their tables, menu and sales", async () => {
    const { ctx } = await createOwnerWithRestaurant("Outlet Hotel", { plan: "enterprise" });
    await db.update(restaurants).set({ kind: "hotel" }).where(eq(restaurants.id, ctx.restaurant.id));
    const h = { ...ctx, restaurant: { ...ctx.restaurant, kind: "hotel" as const } };

    // One step: the outlet and its numbered tables, each with a QR code.
    const restaurant = await createOutlet(db, h, { name: "Restaurant Shiraz", kind: "restaurant", tables: 3 });
    const cafe = await createOutlet(db, h, { name: "Lobby café", kind: "cafe", tables: 2, seats: 2 });
    const cafe2 = await createOutlet(db, h, { name: "Roof café", kind: "cafe", tables: 1 });
    expect([restaurant.prefix, cafe.prefix, cafe2.prefix]).toEqual(["R", "C", "C2-"]);
    const tables = await db.select().from(diningTables).where(eq(diningTables.restaurantId, h.restaurant.id));
    const of = (id: string) => tables.filter((t) => t.outletId === id).map((t) => t.label).sort();
    expect(of(restaurant.id)).toEqual(["R1", "R2", "R3"]);
    expect(of(cafe.id)).toEqual(["C1", "C2"]);
    expect(of(cafe2.id)).toEqual(["C2-1"]);
    expect(tables.find((t) => t.label === "C1")?.zone).toBe("Lobby café");

    // More tables continue the numbering; renaming moves the tables' zone along.
    await addOutletTables(db, h, cafe.id, { tables: 2 });
    await updateOutlet(db, h, cafe.id, { name: "Café Ferdowsi", kind: "cafe", hours: "07:00–23:00" });
    const cafeTables = await db.select().from(diningTables).where(eq(diningTables.outletId, cafe.id));
    expect(cafeTables.map((t) => t.label).sort()).toEqual(["C1", "C2", "C3", "C4"]);
    expect(new Set(cafeTables.map((t) => t.zone))).toEqual(new Set(["Café Ferdowsi"]));

    // Menu: kebabs only in the restaurant, coffee only in the café, water everywhere.
    const kebabs = await createCategory(db, h, { name: "Kebab" });
    const coffee = await createCategory(db, h, { name: "Coffee" });
    const water = await createCategory(db, h, { name: "Water" });
    const k = await createProduct(db, h, { categoryId: kebabs.id, name: "Koobideh", priceCents: 1500 });
    const c = await createProduct(db, h, { categoryId: coffee.id, name: "Espresso", priceCents: 400 });
    await createProduct(db, h, { categoryId: water.id, name: "Water", priceCents: 100 });
    await setOutletMenu(db, h, restaurant.id, [kebabs.id]);
    await setOutletMenu(db, h, cafe.id, [coffee.id]);
    const menu = await loadPublicMenu(db, h.restaurant.id);
    const names = (outletId: string | null) => menuForOutlet(menu, outletId).categories.map((x) => x.name).sort();
    expect(names(restaurant.id)).toEqual(["Kebab", "Water"]);
    expect(names(cafe.id)).toEqual(["Coffee", "Water"]);
    expect(names(null)).toEqual(["Coffee", "Kebab", "Water"]);

    // Sales: a table's outlet is stamped on the order; a takeaway takes the till's outlet.
    const r1 = tables.find((t) => t.label === "R1")!;
    const dineIn = await createPosOrder(db, h, {
      channel: "dine_in",
      tableId: r1.id,
      lines: [{ productId: k.id, quantity: 2 }],
      payment: { provider: "cash" },
      idempotencyKey: key(),
    });
    const takeaway = await createPosOrder(db, h, {
      channel: "takeaway",
      outletId: cafe.id,
      lines: [{ productId: c.id, quantity: 1 }],
      payment: { provider: "cash" },
      idempotencyKey: key(),
    });
    const [o1] = await db.select().from(orders).where(eq(orders.id, dineIn.order.id));
    const [o2] = await db.select().from(orders).where(eq(orders.id, takeaway.order.id));
    expect(o1!.outletId).toBe(restaurant.id);
    expect(o2!.outletId).toBe(cafe.id);

    const list = await listOutlets(db, h);
    const row = (id: string) => list.find((o) => o.id === id)!;
    expect(row(restaurant.id)).toMatchObject({ tables: 3, ordersToday: 1, salesToday: o1!.totalCents, categories: 1 });
    expect(row(cafe.id)).toMatchObject({ name: "Café Ferdowsi", tables: 4, ordersToday: 1, salesToday: o2!.totalCents });

    // Closing an outlet keeps its tables and sales but takes it off the list.
    await archiveOutlet(db, h, cafe2.id);
    expect((await listOutlets(db, h)).map((o) => o.id)).not.toContain(cafe2.id);
  });
});
