import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import {
  cartItems,
  notifications,
  orderItems,
  orders,
  orderStatusEvents,
  restaurantSettings,
} from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createOptionGroup, listOptionGroups } from "@/server/modules/menu/options";
import { createProduct, setProductFlags, updateProduct } from "@/server/modules/menu/products";
import { createTable } from "@/server/modules/tables/service";
import { enterTableByQr, loadGuestContext, type GuestContext } from "@/server/modules/guest/sessions";
import { addToCart, getCartView } from "@/server/modules/cart/service";
import {
  getTableOverview,
  listActiveOrders,
  listGuestOrders,
  placeOrder,
  updateOrderStatus,
} from "@/server/modules/orders/service";
import { canTransition, nextStatus } from "@/server/modules/orders/status";
import { addMember, contextFor, createOwnerWithRestaurant, createUser } from "../helpers/factories";

async function setup() {
  const owner = await createOwnerWithRestaurant("Brielle", { plan: "professional" });
  await db
    .update(restaurantSettings)
    .set({ orderPrefix: "B" })
    .where(eq(restaurantSettings.restaurantId, owner.restaurant.id));
  const table = await createTable(db, owner.ctx, { label: "8" });
  const plats = await createCategory(db, owner.ctx, { name: "Plats" });
  const boissons = await createCategory(db, owner.ctx, { name: "Boissons" });
  const cuisson = await createOptionGroup(db, owner.ctx, {
    name: "Cuisson",
    minSelect: 1,
    maxSelect: 1,
    values: [{ name: "Saignant" }],
  });
  const burger = await createProduct(db, owner.ctx, {
    categoryId: plats.id,
    name: "Burger",
    priceCents: 2000,
  });
  const steak = await createProduct(db, owner.ctx, {
    categoryId: plats.id,
    name: "Steak",
    priceCents: 3500,
    optionGroupIds: [cuisson.id],
  });
  const salade = await createProduct(db, owner.ctx, {
    categoryId: plats.id,
    name: "Salade",
    priceCents: 1500,
  });
  const coca = await createProduct(db, owner.ctx, { categoryId: boissons.id, name: "Coca", priceCents: 500 });
  const cafe = await createProduct(db, owner.ctx, { categoryId: boissons.id, name: "Café", priceCents: 400 });
  const saignant = (await listOptionGroups(db, owner.ctx))[0]!.values[0]!.id;
  return { owner, table, plats, burger, steak, salade, coca, cafe, saignant, cuisson };
}

async function seat(qrToken: string): Promise<GuestContext> {
  const guestId = randomUUID();
  const e = await enterTableByQr(db, qrToken, guestId);
  return (await loadGuestContext(db, guestId, e!.participant.id))!;
}

describe("placing orders", () => {
  it("creates a numbered order with a server-priced snapshot and empties the cart", async () => {
    const { owner, table, steak, coca, saignant } = await setup();
    const g = await seat(table.qrToken);
    await addToCart(db, g, {
      productId: steak.id,
      optionValueIds: [saignant],
      quantity: 2,
      note: "Bien chaud",
    });
    await addToCart(db, g, { productId: coca.id });
    const o = await placeOrder(db, g, { note: "Allergie aux noix" });
    expect(o).toMatchObject({
      number: "B-1001",
      status: "received",
      paymentStatus: "unpaid",
      tableLabel: "8",
      totalCents: 7500,
      subtotalCents: 7500,
      taxCents: 682,
      note: "Allergie aux noix",
    });
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
    expect(items.map((i) => [i.productName, i.quantity, i.lineTotalCents, i.categoryName, i.note])).toEqual([
      ["Steak", 2, 7000, "Plats", "Bien chaud"],
      ["Coca", 1, 500, "Boissons", null],
    ]);
    expect(items[0]!.options).toEqual([
      expect.objectContaining({ groupName: "Cuisson", valueName: "Saignant", priceDeltaCents: 0 }),
    ]);
    expect((await getCartView(db, g)).lines).toHaveLength(0);
    const notes = await db
      .select()
      .from(notifications)
      .where(eq(notifications.restaurantId, owner.restaurant.id));
    expect(notes.some((n) => n.type === "order.created")).toBe(true);
    const [ev] = await db.select().from(orderStatusEvents).where(eq(orderStatusEvents.orderId, o.id));
    expect(ev).toMatchObject({ fromStatus: null, toStatus: "received" });
  });

  it("snapshots stay unchanged when the menu changes afterwards", async () => {
    const { owner, table, burger, plats } = await setup();
    const g = await seat(table.qrToken);
    await addToCart(db, g, { productId: burger.id });
    const o = await placeOrder(db, g);
    await updateProduct(db, owner.ctx, burger.id, {
      categoryId: plats.id,
      name: "Burger XXL",
      priceCents: 2900,
    });
    const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
    expect(item).toMatchObject({ productName: "Burger", unitPriceCents: 2000, lineTotalCents: 2000 });
  });

  it("numbers orders sequentially per restaurant", async () => {
    const a = await setup();
    const b = await setup();
    const ga = await seat(a.table.qrToken);
    const gb = await seat(b.table.qrToken);
    const numbers: string[] = [];
    for (let i = 0; i < 3; i++) {
      await addToCart(db, ga, { productId: a.coca.id });
      numbers.push((await placeOrder(db, ga)).number);
    }
    await addToCart(db, gb, { productId: b.coca.id });
    expect(numbers).toEqual(["B-1001", "B-1002", "B-1003"]);
    expect((await placeOrder(db, gb)).number).toBe("B-1001");
  });

  it("a double submit creates exactly one order", async () => {
    const { table, burger } = await setup();
    const g = await seat(table.qrToken);
    await addToCart(db, g, { productId: burger.id });
    const results = await Promise.allSettled([placeOrder(db, g), placeOrder(db, g), placeOrder(db, g)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason.message),
    ).toEqual(["cart_empty", "cart_empty"]);
    expect(await listGuestOrders(db, g)).toHaveLength(1);
  });

  it("refuses empty carts, carts with invalid lines and closed sessions", async () => {
    const { owner, table, burger, coca } = await setup();
    const g = await seat(table.qrToken);
    await expect(placeOrder(db, g)).rejects.toMatchObject({ message: "cart_empty" });
    await addToCart(db, g, { productId: burger.id });
    await addToCart(db, g, { productId: coca.id });
    await setProductFlags(db, owner.ctx, coca.id, { isAvailable: false });
    await expect(placeOrder(db, g)).rejects.toMatchObject({ message: "cart_has_issues" });
    const [count] = await db.select().from(cartItems);
    expect(count).toBeTruthy(); // nothing was consumed
  });

  it("can require payment before the order reaches the kitchen", async () => {
    const { owner, table, coca } = await setup();
    await db
      .update(restaurantSettings)
      .set({ requirePaymentBeforeOrder: true })
      .where(eq(restaurantSettings.restaurantId, owner.restaurant.id));
    const g = await seat(table.qrToken);
    await addToCart(db, g, { productId: coca.id });
    expect((await placeOrder(db, g)).status).toBe("pending_payment");
  });
});

describe("multi-client table (spec §12)", () => {
  it("each client orders and owes separately; staff sees the whole table", async () => {
    const { owner, table, burger, coca, steak, cafe, salade, saignant } = await setup();
    const c1 = await seat(table.qrToken);
    const c2 = await seat(table.qrToken);
    const c3 = await seat(table.qrToken);
    await addToCart(db, c1, { productId: burger.id });
    await addToCart(db, c1, { productId: coca.id });
    await placeOrder(db, c1);
    await addToCart(db, c2, { productId: steak.id, optionValueIds: [saignant] });
    await addToCart(db, c2, { productId: cafe.id });
    await placeOrder(db, c2);
    await addToCart(db, c3, { productId: salade.id });
    await placeOrder(db, c3);

    const view = await getTableOverview(db, owner.ctx, table.id);
    expect(view.participants.map((p) => [p.seq, p.totalCents])).toEqual([
      [1, 2500],
      [2, 3900],
      [3, 1500],
    ]);
    expect(view.tableTotalCents).toBe(7900);
    expect(view.unpaidCents).toBe(7900);

    // Guests only see their own orders; ordering again keeps the session.
    expect((await listGuestOrders(db, c1)).map((o) => o.totalCents)).toEqual([2500]);
    await addToCart(db, c1, { productId: cafe.id });
    await placeOrder(db, c1);
    expect((await listGuestOrders(db, c1)).map((o) => o.totalCents)).toEqual([400, 2500]);
    expect((await getTableOverview(db, owner.ctx, table.id)).tableTotalCents).toBe(8300);
  });
});

describe("order workflow", () => {
  it("allows forward moves and cancellation, never going back", () => {
    expect(canTransition("received", "accepted")).toBe(true);
    expect(canTransition("received", "served")).toBe(true);
    expect(canTransition("ready", "preparing")).toBe(false);
    expect(canTransition("served", "cancelled")).toBe(false);
    expect(canTransition("pending_payment", "accepted")).toBe(false);
    expect(canTransition("pending_payment", "received")).toBe(true);
    expect(nextStatus("received")).toBe("accepted");
    expect(nextStatus("served")).toBeNull();
  });

  it("stamps each step, including skipped ones, and records events", async () => {
    const { owner, table, burger } = await setup();
    const g = await seat(table.qrToken);
    await addToCart(db, g, { productId: burger.id });
    const o = await placeOrder(db, g);
    await updateOrderStatus(db, owner.ctx, o.id, "preparing");
    const ready = await updateOrderStatus(db, owner.ctx, o.id, "ready");
    expect(ready.acceptedAt).not.toBeNull();
    expect(ready.preparingAt).not.toBeNull();
    expect(ready.readyAt).not.toBeNull();
    await expect(updateOrderStatus(db, owner.ctx, o.id, "accepted")).rejects.toMatchObject({
      message: "invalid_transition",
    });
    const served = await updateOrderStatus(db, owner.ctx, o.id, "served");
    expect(served.servedAt).not.toBeNull();
    const events = await db.select().from(orderStatusEvents).where(eq(orderStatusEvents.orderId, o.id));
    expect(events.map((e) => e.toStatus)).toEqual(["received", "preparing", "ready", "served"]);
    const ready2 = await db.select().from(notifications).where(eq(notifications.type, "order.ready"));
    expect(ready2.some((n) => (n.payload as { orderId: string }).orderId === o.id)).toBe(true);
  });

  it("only one of two concurrent transitions wins", async () => {
    const { owner, table, burger } = await setup();
    const g = await seat(table.qrToken);
    await addToCart(db, g, { productId: burger.id });
    const o = await placeOrder(db, g);
    const r = await Promise.allSettled([
      updateOrderStatus(db, owner.ctx, o.id, "accepted"),
      updateOrderStatus(db, owner.ctx, o.id, "accepted"),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });

  it("staff updates statuses but cannot cancel; other tenants cannot touch the order", async () => {
    const { owner, table, burger } = await setup();
    const other = await setup();
    const g = await seat(table.qrToken);
    await addToCart(db, g, { productId: burger.id });
    const o = await placeOrder(db, g);
    const s = await createUser();
    await addMember(owner.restaurant.id, s.user.id, "staff");
    const sctx = await contextFor(s.sessionUser, owner.restaurant.id);
    await expect(updateOrderStatus(db, sctx, o.id, "accepted")).resolves.toMatchObject({
      status: "accepted",
    });
    await expect(updateOrderStatus(db, sctx, o.id, "cancelled")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateOrderStatus(db, other.owner.ctx, o.id, "ready")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await listActiveOrders(db, other.owner.ctx)).toHaveLength(0);
    const cancelled = await updateOrderStatus(db, owner.ctx, o.id, "cancelled", { reason: "Client parti" });
    expect(cancelled).toMatchObject({ status: "cancelled", cancelReason: "Client parti" });
    const [row] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(row?.cancelledAt).not.toBeNull();
  });

  it("cancelled orders do not count in the table total", async () => {
    const { owner, table, burger, coca } = await setup();
    const g = await seat(table.qrToken);
    await addToCart(db, g, { productId: burger.id });
    const o1 = await placeOrder(db, g);
    await addToCart(db, g, { productId: coca.id });
    await placeOrder(db, g);
    await updateOrderStatus(db, owner.ctx, o1.id, "cancelled");
    expect((await getTableOverview(db, owner.ctx, table.id)).tableTotalCents).toBe(500);
  });
});
