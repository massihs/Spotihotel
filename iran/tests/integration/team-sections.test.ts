import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { restaurantMembers } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { saveStation } from "@/server/modules/kitchen/stations";
import { createTable } from "@/server/modules/tables/service";
import { enterTableByQr, loadGuestContext } from "@/server/modules/guest/sessions";
import { addToCart } from "@/server/modules/cart/service";
import { placeOrder } from "@/server/modules/orders/service";
import { callWaiter } from "@/server/modules/guest/waiter";
import { listNotifications } from "@/server/modules/notifications/service";
import { listMembers } from "@/server/modules/members/service";
import {
  deleteSection,
  guestCallsOf,
  saveGuestCalls,
  saveSection,
  setMemberSections,
} from "@/server/modules/team/sections";
import { addMember, contextFor, createOwnerWithRestaurant, createUser } from "../helpers/factories";

async function staff(restaurantId: string) {
  const { user, sessionUser } = await createUser();
  await addMember(restaurantId, user.id, "staff");
  const [m] = await db
    .select({ id: restaurantMembers.id })
    .from(restaurantMembers)
    .where(and(eq(restaurantMembers.restaurantId, restaurantId), eq(restaurantMembers.userId, user.id)));
  return { memberId: m!.id, sessionUser };
}

async function seat(qrToken: string) {
  const guestId = randomUUID();
  const e = await enterTableByQr(db, qrToken, guestId);
  return (await loadGuestContext(db, guestId, e!.participant.id))!;
}

describe("team sections", () => {
  it("gives a section its own access level", async () => {
    const { ctx } = await createOwnerWithRestaurant("Chicha House");
    const s = await saveSection(db, ctx, null, {
      name: "Chicha",
      color: "amber",
      permissions: ["orders.view", "tables.view"],
      notify: ["calls"],
      stationIds: [],
    });
    const a = await staff(ctx.restaurant.id);
    let actx = await contextFor(a.sessionUser, ctx.restaurant.id);
    expect(actx.permissions.has("payments.record")).toBe(true); // staff defaults

    await setMemberSections(db, ctx, a.memberId, [s.id]);
    actx = await contextFor(a.sessionUser, ctx.restaurant.id);
    expect([...actx.permissions].sort()).toEqual(["orders.view", "restaurant.view", "tables.view"]);
    const listed = (await listMembers(db, ctx)).find((m) => m.id === a.memberId)!;
    expect(listed.accessFromSection).toBe(true);

    // Back to the role's access once the section is gone.
    await deleteSection(db, ctx, s.id);
    actx = await contextFor(a.sessionUser, ctx.restaurant.id);
    expect(actx.sectionIds).toEqual([]);
    expect(actx.permissions.has("payments.record")).toBe(true);
  });

  it("routes a bell option and orders only to the sections concerned", async () => {
    const { ctx } = await createOwnerWithRestaurant("Lounge");
    const cat = await createCategory(db, ctx, { name: "Chicha" });
    const hookahStation = await saveStation(db, ctx, null, { name: "Chicha", categoryIds: [cat.id] });
    const food = await createCategory(db, ctx, { name: "Plats" });
    const hookah = await createProduct(db, ctx, { categoryId: cat.id, name: "Pomme", priceCents: 3000 });
    const kebab = await createProduct(db, ctx, { categoryId: food.id, name: "Kebab", priceCents: 2000 });

    const chicha = await saveSection(db, ctx, null, {
      name: "Chicha",
      color: "amber",
      permissions: null,
      notify: ["orders"],
      stationIds: [hookahStation],
    });
    const salle = await saveSection(db, ctx, null, {
      name: "Salle",
      color: "sky",
      permissions: null,
      notify: ["calls", "orders"],
      stationIds: [],
    });
    const c = await staff(ctx.restaurant.id);
    const w = await staff(ctx.restaurant.id);
    const free = await staff(ctx.restaurant.id); // no section: sees everything
    await setMemberSections(db, ctx, c.memberId, [chicha.id]);
    await setMemberSections(db, ctx, w.memberId, [salle.id]);

    await saveGuestCalls(db, ctx, [
      { key: "waiter", enabled: true },
      { key: "bill", enabled: true },
      { key: "water", enabled: false },
      { key: "c-coal01", label: "Charbon", icon: "flame", sectionId: chicha.id, enabled: true },
    ]);
    const offered = await guestCallsOf(db, ctx.restaurant.id);
    expect(offered.map((o) => o.key)).toEqual(["waiter", "bill", "c-coal01"]);

    const table = await createTable(db, ctx, { label: "7" });
    const g1 = await seat(table.qrToken);
    await expect(callWaiter(db, g1, "water")).rejects.toMatchObject({ message: "invalid_call" });
    await callWaiter(db, g1, "c-coal01");
    const g2 = await seat(table.qrToken);
    await callWaiter(db, g2, "waiter");

    await addToCart(db, g1, { productId: kebab.id });
    await placeOrder(db, g1);
    await addToCart(db, g2, { productId: hookah.id });
    await placeOrder(db, g2);

    const seen = async (u: typeof c) => {
      const { items } = await listNotifications(db, await contextFor(u.sessionUser, ctx.restaurant.id));
      return items.map((n) => `${n.type}:${String(n.payload.kind ?? n.payload.tableLabel)}`).sort();
    };
    // Chicha: the charcoal call and the hookah order only.
    expect(await seen(c)).toEqual(["order.created:7", "waiter.call:c-coal01"]);
    // Salle: the waiter call and both orders.
    expect(await seen(w)).toEqual(["order.created:7", "order.created:7", "waiter.call:waiter"]);
    expect((await seen(free)).length).toBe(4);
    expect((await listNotifications(db, ctx)).items.length).toBe(4); // owner
  });
});
