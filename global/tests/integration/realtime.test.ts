import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { orders, tableSessions } from "@/server/db/schema";
import { emit, PostgresRealtimeBus, topics, type RealtimeEvent } from "@/server/infra/realtime";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createTable } from "@/server/modules/tables/service";
import { enterTableByQr, loadGuestContext } from "@/server/modules/guest/sessions";
import { addToCart } from "@/server/modules/cart/service";
import { placeOrder, updateOrderStatus } from "@/server/modules/orders/service";
import { closeTableSession, getFloor } from "@/server/modules/floor/service";
import { listNotifications, markNotificationsRead } from "@/server/modules/notifications/service";
import { addMember, contextFor, createOwnerWithRestaurant, createUser } from "../helpers/factories";

const bus = new PostgresRealtimeBus(process.env.DATABASE_URL_DIRECT!);
afterAll(() => bus.close());

/** Collects events of a topic and lets a test wait for a given type. */
async function listen(topic: string) {
  const events: RealtimeEvent[] = [];
  type Match = (e: RealtimeEvent) => boolean;
  const waiters: { match: Match; resolve: (e: RealtimeEvent) => void }[] = [];
  const off = await bus.subscribe(topic, (e) => {
    events.push(e);
    for (const w of [...waiters]) {
      if (!w.match(e)) continue;
      waiters.splice(waiters.indexOf(w), 1);
      w.resolve(e);
    }
  });
  const next = (type: string, ms = 3000, where: Partial<Record<string, unknown>> = {}) =>
    new Promise<RealtimeEvent>((resolve, reject) => {
      const match: Match = (e) =>
        e.type === type && Object.entries(where).every(([k, v]) => e.data?.[k] === v);
      const hit = events.find(match);
      if (hit) return resolve(hit);
      waiters.push({ match, resolve });
      setTimeout(() => reject(new Error(`timeout waiting for ${type} on ${topic}`)), ms);
    });
  return { events, next, off };
}

async function setup() {
  const owner = await createOwnerWithRestaurant("Live", { plan: "professional" });
  const t1 = await createTable(db, owner.ctx, { label: "1" });
  const t2 = await createTable(db, owner.ctx, { label: "2" });
  await createTable(db, owner.ctx, { label: "3" });
  const cat = await createCategory(db, owner.ctx, { name: "Plats" });
  const burger = await createProduct(db, owner.ctx, { categoryId: cat.id, name: "Burger", priceCents: 2000 });
  return { owner, t1, t2, burger };
}

async function seatAndOrder(qrToken: string, productId: string) {
  const guestId = randomUUID();
  const e = await enterTableByQr(db, qrToken, guestId);
  const g = (await loadGuestContext(db, guestId, e!.participant.id))!;
  await addToCart(db, g, { productId });
  return { g, order: await placeOrder(db, g) };
}

describe("realtime bus (Postgres LISTEN/NOTIFY)", () => {
  it("delivers committed events to subscribers of the topic only", async () => {
    const a = await listen("test:a");
    const b = await listen("test:b");
    await db.transaction(async (tx) => emit(tx, { topic: "test:a", type: "menu.updated", data: { x: 1 } }));
    expect((await a.next("menu.updated")).data).toEqual({ x: 1 });
    await new Promise((r) => setTimeout(r, 150));
    expect(b.events).toHaveLength(0);
    a.off();
    b.off();
  });

  it("never delivers events of a rolled-back transaction", async () => {
    const a = await listen("test:rollback");
    await db
      .transaction(async (tx) => {
        await emit(tx, { topic: "test:rollback", type: "menu.updated" });
        throw new Error("boom");
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
    expect(a.events).toHaveLength(0);
    a.off();
  });

  it("publishes order events to the restaurant and to the ordering guest", async () => {
    const { owner, t1, burger } = await setup();
    const staff = await listen(topics.restaurant(owner.restaurant.id));
    const { g, order } = await seatAndOrder(t1.qrToken, burger.id);
    const guest = await listen(topics.participant(g.participant.id));
    expect((await staff.next("session.opened")).type).toBe("session.opened");
    expect((await staff.next("order.created")).data).toMatchObject({ orderId: order.id, tableId: t1.id });
    // The new-order notification is pushed too (dashboard bell).
    await staff.next("notification.created");
    const before = staff.events.filter((e) => e.type === "notification.created").length;
    await updateOrderStatus(db, owner.ctx, order.id, "ready");
    expect((await guest.next("order.updated", 3000, { status: "ready" })).data).toMatchObject({
      orderId: order.id,
      status: "ready",
    });
    // …and the "ready" notification as well.
    await new Promise((r) => setTimeout(r, 300));
    expect(staff.events.filter((e) => e.type === "notification.created").length).toBe(before + 1);
    staff.off();
    guest.off();
  });
});

describe("floor view", () => {
  it("computes free / in progress / occupied with people and totals", async () => {
    const { owner, t1, t2, burger } = await setup();
    const { order } = await seatAndOrder(t1.qrToken, burger.id);
    await seatAndOrder(t1.qrToken, burger.id);
    await enterTableByQr(db, t2.qrToken, randomUUID());
    let floor = await getFloor(db, owner.ctx);
    const byLabel = (l: string) => floor.find((t) => t.label === l)!;
    expect(byLabel("1")).toMatchObject({
      state: "in_progress",
      people: 2,
      ordersCount: 2,
      totalCents: 4000,
      unpaidCents: 4000,
    });
    expect(byLabel("2")).toMatchObject({ state: "occupied", people: 1, ordersCount: 0 });
    expect(byLabel("3")).toMatchObject({ state: "free", people: 0, sessionId: null });

    await updateOrderStatus(db, owner.ctx, order.id, "ready");
    floor = await getFloor(db, owner.ctx);
    expect(byLabel("1").readyOrders).toBe(1);
  });
});

describe("closing a table", () => {
  it("refuses while something is cooking or unpaid; closes once settled and kicks guests out", async () => {
    const { owner, t1, burger } = await setup();
    const { g, order } = await seatAndOrder(t1.qrToken, burger.id);
    const sessionTopic = await listen(topics.session(g.session.id));
    await expect(closeTableSession(db, owner.ctx, t1.id)).rejects.toMatchObject({
      message: "session_has_active_orders",
    });
    await updateOrderStatus(db, owner.ctx, order.id, "served");
    await expect(closeTableSession(db, owner.ctx, t1.id)).rejects.toMatchObject({
      message: "session_has_unpaid",
    });
    await db.update(orders).set({ paymentStatus: "paid" }).where(eq(orders.id, order.id));
    await closeTableSession(db, owner.ctx, t1.id);
    expect((await sessionTopic.next("session.closed")).type).toBe("session.closed");
    expect(await loadGuestContext(db, g.guestId, g.participant.id)).toBeNull();
    expect((await getFloor(db, owner.ctx)).find((t) => t.id === t1.id)?.state).toBe("free");
    sessionTopic.off();
  });

  it("only managers can force-close; staff can close settled tables; tenants are isolated", async () => {
    const { owner, t1, burger } = await setup();
    const other = await setup();
    await seatAndOrder(t1.qrToken, burger.id);
    const s = await createUser();
    await addMember(owner.restaurant.id, s.user.id, "staff");
    const sctx = await contextFor(s.sessionUser, owner.restaurant.id);
    await expect(closeTableSession(db, sctx, t1.id, { force: true })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(closeTableSession(db, other.owner.ctx, t1.id, { force: true })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await closeTableSession(db, owner.ctx, t1.id, { force: true });
    const [closed] = await db.select().from(tableSessions).where(eq(tableSessions.tableId, t1.id));
    expect(closed).toMatchObject({ status: "closed", closedReason: "staff", closedByUserId: owner.user.id });
    await expect(closeTableSession(db, owner.ctx, t1.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("notifications", () => {
  it("lists the restaurant's notifications, counts unread and marks them read", async () => {
    const { owner, t1, burger } = await setup();
    const other = await setup();
    const { order } = await seatAndOrder(t1.qrToken, burger.id);
    await updateOrderStatus(db, owner.ctx, order.id, "ready");
    let n = await listNotifications(db, owner.ctx);
    expect(n.items.map((i) => i.type).sort()).toEqual(["order.created", "order.ready"]);
    expect(n.unread).toBe(2);
    expect((await listNotifications(db, other.owner.ctx)).items).toHaveLength(0);
    await markNotificationsRead(db, owner.ctx);
    n = await listNotifications(db, owner.ctx);
    expect(n.unread).toBe(0);
  });
});
