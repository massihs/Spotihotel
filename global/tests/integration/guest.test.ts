import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { orders, restaurantSettings, tableSessions } from "@/server/db/schema";
import { createCategory, updateCategory } from "@/server/modules/menu/categories";
import { createOptionGroup, listOptionGroups, updateOptionGroup } from "@/server/modules/menu/options";
import { createProduct, deleteProduct, setProductFlags, updateProduct } from "@/server/modules/menu/products";
import { loadPublicMenu } from "@/server/modules/menu/public";
import { createTable, regenerateQr, setQrEnabled } from "@/server/modules/tables/service";
import {
  enterTableByQr,
  listSessionParticipants,
  loadGuestContext,
  renameParticipant,
  type GuestContext,
} from "@/server/modules/guest/sessions";
import { addToCart, getCartView, removeCartItem, setCartItemQuantity } from "@/server/modules/cart/service";
import { setRestaurantStatus } from "@/server/modules/restaurants/service";
import { createOwnerWithRestaurant } from "../helpers/factories";

async function setup() {
  const owner = await createOwnerWithRestaurant("Brielle");
  const table = await createTable(db, owner.ctx, { label: "12" });
  const steakCat = await createCategory(db, owner.ctx, { name: "Steak" });
  const drinks = await createCategory(db, owner.ctx, { name: "Boissons" });
  const cuisson = await createOptionGroup(db, owner.ctx, {
    name: "Cuisson",
    minSelect: 1,
    maxSelect: 1,
    values: [{ name: "Saignant" }, { name: "À point" }],
  });
  const sup = await createOptionGroup(db, owner.ctx, {
    name: "Suppléments",
    minSelect: 0,
    maxSelect: 2,
    values: [
      { name: "Fromage", priceDeltaCents: 200 },
      { name: "Frites", priceDeltaCents: 300 },
    ],
  });
  const steak = await createProduct(db, owner.ctx, {
    categoryId: steakCat.id,
    name: "Entrecôte",
    priceCents: 3200,
    optionGroupIds: [cuisson.id, sup.id],
  });
  const coca = await createProduct(db, owner.ctx, { categoryId: drinks.id, name: "Coca", priceCents: 450 });
  const groups = await listOptionGroups(db, owner.ctx);
  const v = (g: string, name: string) =>
    groups.find((x) => x.name === g)!.values.find((x) => x.name === name)!.id;
  return { owner, table, steak, coca, steakCat, drinks, cuisson, v };
}

async function guestAt(qrToken: string, guestId = randomUUID()): Promise<GuestContext> {
  const entry = await enterTableByQr(db, qrToken, guestId);
  expect(entry).not.toBeNull();
  return (await loadGuestContext(db, guestId, entry!.participant.id))!;
}

describe("table sessions & participants", () => {
  it("first scan opens a session; each device becomes Client 1, 2, 3; rescans are idempotent", async () => {
    const { table } = await setup();
    const g1 = randomUUID();
    const a = await enterTableByQr(db, table.qrToken, g1);
    const b = await enterTableByQr(db, table.qrToken, randomUUID());
    const c = await enterTableByQr(db, table.qrToken, randomUUID());
    const again = await enterTableByQr(db, table.qrToken, g1);
    expect(new Set([a!.session.id, b!.session.id, c!.session.id, again!.session.id]).size).toBe(1);
    expect([a!.participant.seq, b!.participant.seq, c!.participant.seq]).toEqual([1, 2, 3]);
    expect(again!.participant.id).toBe(a!.participant.id);
    expect(await listSessionParticipants(db, a!.session.id)).toHaveLength(3);
  });

  it("is safe under concurrent first scans (one session, unique seats)", async () => {
    const { table } = await setup();
    const entries = await Promise.all(
      Array.from({ length: 8 }, () => enterTableByQr(db, table.qrToken, randomUUID())),
    );
    expect(new Set(entries.map((e) => e!.session.id)).size).toBe(1);
    expect(entries.map((e) => e!.participant.seq).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("does not resolve disabled, regenerated or suspended QR codes", async () => {
    const { owner, table } = await setup();
    await setQrEnabled(db, owner.ctx, table.id, false);
    expect(await enterTableByQr(db, table.qrToken, randomUUID())).toBeNull();
    await setQrEnabled(db, owner.ctx, table.id, true);
    const fresh = await regenerateQr(db, owner.ctx, table.id);
    expect(await enterTableByQr(db, table.qrToken, randomUUID())).toBeNull();
    expect(await enterTableByQr(db, fresh.qrToken, randomUUID())).not.toBeNull();
    await setRestaurantStatus(db, owner.restaurant.id, "suspended");
    expect(await enterTableByQr(db, fresh.qrToken, randomUUID())).toBeNull();
  });

  it("rejects a seat cookie used from another device and closed sessions", async () => {
    const { table } = await setup();
    const g1 = randomUUID();
    const entry = await enterTableByQr(db, table.qrToken, g1);
    expect(await loadGuestContext(db, g1, entry!.participant.id)).not.toBeNull();
    expect(await loadGuestContext(db, randomUUID(), entry!.participant.id)).toBeNull();
    await db
      .update(tableSessions)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(tableSessions.id, entry!.session.id));
    expect(await loadGuestContext(db, g1, entry!.participant.id)).toBeNull();
    // The next scan starts a new session for a new group.
    const next = await enterTableByQr(db, table.qrToken, g1);
    expect(next!.session.id).not.toBe(entry!.session.id);
    expect(next!.participant.seq).toBe(1);
  });

  it("auto-closes idle sessions lazily, but never with unpaid orders", async () => {
    const { owner, table } = await setup();
    await db
      .update(restaurantSettings)
      .set({ sessionAutoCloseMinutes: 60 })
      .where(eq(restaurantSettings.restaurantId, owner.restaurant.id));
    const first = await enterTableByQr(db, table.qrToken, randomUUID());
    const longAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await db
      .update(tableSessions)
      .set({ lastActivityAt: longAgo })
      .where(eq(tableSessions.id, first!.session.id));
    await db.insert(orders).values({
      restaurantId: owner.restaurant.id,
      number: "B-1",
      seq: 1,
      tableSessionId: first!.session.id,
      status: "served",
      paymentStatus: "unpaid",
      currency: "EUR",
      subtotalCents: 1000,
      taxCents: 91,
      totalCents: 1000,
    });
    const stillOpen = await enterTableByQr(db, table.qrToken, randomUUID());
    expect(stillOpen!.session.id).toBe(first!.session.id);

    await db
      .update(orders)
      .set({ paymentStatus: "paid" })
      .where(eq(orders.tableSessionId, first!.session.id));
    await db
      .update(tableSessions)
      .set({ lastActivityAt: longAgo })
      .where(eq(tableSessions.id, first!.session.id));
    const renewed = await enterTableByQr(db, table.qrToken, randomUUID());
    expect(renewed!.session.id).not.toBe(first!.session.id);
    const [old] = await db.select().from(tableSessions).where(eq(tableSessions.id, first!.session.id));
    expect(old).toMatchObject({ status: "closed", closedReason: "auto" });
  });

  it("lets guests set a display name", async () => {
    const { table } = await setup();
    const g = await guestAt(table.qrToken);
    expect(await renameParticipant(db, g, "   Léa   la   gourmande  ")).toBe("Léa la gourmande");
    expect(await renameParticipant(db, g, "")).toBeNull();
  });
});

describe("public menu", () => {
  it("only exposes active categories and active, non-deleted products", async () => {
    const { owner, steak, coca, drinks } = await setup();
    const hidden = await createProduct(db, owner.ctx, {
      categoryId: drinks.id,
      name: "Secret",
      priceCents: 100,
      isActive: false,
    });
    const gone = await createProduct(db, owner.ctx, {
      categoryId: drinks.id,
      name: "Ancien",
      priceCents: 100,
    });
    await deleteProduct(db, owner.ctx, gone.id);
    let menu = await loadPublicMenu(db, owner.restaurant.id);
    expect(menu.categories.map((c) => c.name)).toEqual(["Steak", "Boissons"]);
    expect(Object.keys(menu.products).sort()).toEqual([steak.id, coca.id].sort());
    expect(menu.products[hidden.id]).toBeUndefined();
    expect(menu.products[steak.id]!.optionGroups.map((g) => g.name)).toEqual(["Cuisson", "Suppléments"]);
    expect(menu.products[steak.id]!.taxRateBps).toBe(1000);

    await updateCategory(db, owner.ctx, drinks.id, { name: "Boissons", isActive: false });
    menu = await loadPublicMenu(db, owner.restaurant.id);
    expect(menu.categories.map((c) => c.name)).toEqual(["Steak"]);
    expect(menu.products[coca.id]).toBeUndefined();
  });

  it("never mixes restaurants", async () => {
    const a = await setup();
    const b = await setup();
    const menuA = await loadPublicMenu(db, a.owner.restaurant.id);
    expect(menuA.products[b.steak.id]).toBeUndefined();
  });
});

describe("cart", () => {
  it("adds lines with server-side prices, merges identical lines and keeps notes apart", async () => {
    const { table, steak, coca, v } = await setup();
    const g = await guestAt(table.qrToken);
    await addToCart(db, g, {
      productId: steak.id,
      optionValueIds: [v("Suppléments", "Frites"), v("Cuisson", "Saignant")],
      quantity: 1,
    });
    await addToCart(db, g, {
      productId: steak.id,
      optionValueIds: [v("Cuisson", "Saignant"), v("Suppléments", "Frites")],
      quantity: 1,
    });
    await addToCart(db, g, {
      productId: steak.id,
      optionValueIds: [v("Cuisson", "Saignant")],
      quantity: 1,
      note: "Sans sel",
    });
    await addToCart(db, g, { productId: coca.id, quantity: 2 });
    const cart = await getCartView(db, g);
    expect(cart.lines.map((l) => [l.name, l.quantity, l.line?.lineTotalCents, l.note])).toEqual([
      ["Entrecôte", 2, 7000, null],
      ["Entrecôte", 1, 3200, "Sans sel"],
      ["Coca", 2, 900, null],
    ]);
    expect(cart.itemCount).toBe(5);
    expect(cart.totals.totalCents).toBe(11100);
    expect(cart.totals.taxCents).toBe(1009);
  });

  it("rejects invalid option combinations, foreign products and sold-out dishes", async () => {
    const { owner, table, steak, coca, v } = await setup();
    const other = await setup();
    const g = await guestAt(table.qrToken);
    await expect(addToCart(db, g, { productId: steak.id })).rejects.toMatchObject({
      message: "too_few_options",
    });
    await expect(
      addToCart(db, g, {
        productId: steak.id,
        optionValueIds: [v("Cuisson", "Saignant"), v("Cuisson", "À point")],
      }),
    ).rejects.toMatchObject({ message: "too_many_options" });
    await expect(
      addToCart(db, g, { productId: steak.id, optionValueIds: [other.v("Cuisson", "Saignant")] }),
    ).rejects.toMatchObject({ message: "invalid_option" });
    await expect(addToCart(db, g, { productId: other.coca.id })).rejects.toMatchObject({
      message: "product_unavailable",
    });
    await setProductFlags(db, owner.ctx, coca.id, { isAvailable: false });
    await expect(addToCart(db, g, { productId: coca.id })).rejects.toMatchObject({
      message: "product_unavailable",
    });
    await expect(
      addToCart(db, g, { productId: steak.id, optionValueIds: [v("Cuisson", "Saignant")], quantity: 100 }),
    ).rejects.toBeTruthy();
  });

  it("re-prices from the database and flags lines that became invalid", async () => {
    const { owner, table, steak, coca, cuisson, v, steakCat } = await setup();
    const g = await guestAt(table.qrToken);
    await addToCart(db, g, { productId: steak.id, optionValueIds: [v("Cuisson", "Saignant")] });
    await addToCart(db, g, { productId: coca.id });
    // The restaurant raises a price, sells out a dish and removes an option.
    await updateProduct(db, owner.ctx, steak.id, {
      categoryId: steakCat.id,
      name: "Entrecôte",
      priceCents: 3500,
      optionGroupIds: [cuisson.id],
    });
    await setProductFlags(db, owner.ctx, coca.id, { isAvailable: false });
    let cart = await getCartView(db, g);
    expect(cart.lines[0]!.line?.lineTotalCents).toBe(3500);
    expect(cart.lines[1]!.issue).toBe("product_unavailable");
    expect(cart.totals.totalCents).toBe(3500);
    expect(cart.hasIssues).toBe(true);

    await updateOptionGroup(db, owner.ctx, cuisson.id, {
      name: "Cuisson",
      minSelect: 1,
      maxSelect: 1,
      values: [{ name: "Bleu" }],
    });
    cart = await getCartView(db, g);
    expect(cart.lines[0]!.issue).toBe("invalid_option");
  });

  it("each participant has their own cart; nobody can touch another's lines", async () => {
    const { table, coca } = await setup();
    const alice = await guestAt(table.qrToken);
    const bob = await guestAt(table.qrToken);
    await addToCart(db, alice, { productId: coca.id, quantity: 3 });
    await addToCart(db, bob, { productId: coca.id, quantity: 1 });
    const aliceLine = (await getCartView(db, alice)).lines[0]!;
    await expect(setCartItemQuantity(db, bob, aliceLine.id, 99)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(removeCartItem(db, bob, aliceLine.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await getCartView(db, alice)).itemCount).toBe(3);
    expect((await getCartView(db, bob)).itemCount).toBe(1);

    await setCartItemQuantity(db, alice, aliceLine.id, 1);
    expect((await getCartView(db, alice)).itemCount).toBe(1);
    await removeCartItem(db, alice, aliceLine.id);
    expect((await getCartView(db, alice)).lines).toHaveLength(0);
  });
});
