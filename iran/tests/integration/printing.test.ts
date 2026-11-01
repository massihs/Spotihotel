import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { printJobs, restaurantMembers, restaurantSettings } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createTable } from "@/server/modules/tables/service";
import { enterTableByQr, loadGuestContext } from "@/server/modules/guest/sessions";
import { addToCart } from "@/server/modules/cart/service";
import { placeOrder, updateOrderStatus } from "@/server/modules/orders/service";
import { saveStation } from "@/server/modules/kitchen/stations";
import { setMemberJob } from "@/server/modules/members/service";
import {
  ackJob,
  authenticateAgent,
  leaseJobs,
  newAgentToken,
  savePrinter,
  setCashierAcceptance,
} from "@/server/modules/printing/service";
import { loadRestaurantContext } from "@/server/tenancy";
import { addMember, createOwnerWithRestaurant, createUser } from "../helpers/factories";

async function guestOrder(qrToken: string, productIds: string[]) {
  const guestId = randomUUID();
  const e = await enterTableByQr(db, qrToken, guestId);
  const g = (await loadGuestContext(db, guestId, e!.participant.id))!;
  for (const productId of productIds) await addToCart(db, g, { productId });
  return placeOrder(db, g, {});
}

describe("kitchen flow and printing", () => {
  it("queues station and till tickets once the till accepts, and serves them to the agent", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant("Printy", { plan: "professional" });
    const table = await createTable(db, ctx, { label: "5" });
    const mains = await createCategory(db, ctx, { name: "Mains" });
    const drinks = await createCategory(db, ctx, { name: "Drinks" });
    const burger = await createProduct(db, ctx, {
      categoryId: mains.id,
      name: "برگر",
      priceCents: 2_000_000,
    });
    const tea = await createProduct(db, ctx, { categoryId: drinks.id, name: "چای", priceCents: 300_000 });
    const kitchen = await saveStation(db, ctx, null, {
      name: "آشپزخانه",
      color: "orange",
      categoryIds: [mains.id],
    });
    const bar = await saveStation(db, ctx, null, { name: "بار", color: "sky", categoryIds: [drinks.id] });
    await savePrinter(db, ctx, null, { name: "K", host: "10.0.0.5", target: "station", stationId: kitchen });
    await savePrinter(db, ctx, null, { name: "B", host: "10.0.0.6", target: "station", stationId: bar });
    await savePrinter(db, ctx, null, {
      name: "Till",
      host: "10.0.0.7",
      target: "cashier",
      stationId: null,
      paperMm: 58,
    });

    // Acceptance at the till (default): nothing goes to the kitchen until it is accepted.
    const o = await guestOrder(table.qrToken, [burger.id]);
    const jobsOf = () => db.select().from(printJobs).where(eq(printJobs.restaurantId, restaurant.id));
    expect(await jobsOf()).toHaveLength(0);
    await updateOrderStatus(db, ctx, o.id, "accepted");
    const queued = await jobsOf();
    // Kitchen (its burger) and till; the bar has nothing on this order.
    expect(queued.map((j) => j.kind).sort()).toEqual(["cashier", "station"]);
    // Moving on does not print again.
    await updateOrderStatus(db, ctx, o.id, "preparing");
    expect(await jobsOf()).toHaveLength(2);

    // The agent authenticates with its token and gets rendered ESC/POS tickets.
    expect(await authenticateAgent(db, "nope")).toBeNull();
    const token = await newAgentToken(db, ctx);
    expect(await authenticateAgent(db, token)).toBe(restaurant.id);
    const jobs = await leaseJobs(db, restaurant.id);
    expect(jobs).toHaveLength(2);
    for (const j of jobs) {
      const bytes = Buffer.from(j.data, "base64");
      expect([...bytes.subarray(0, 2)]).toEqual([0x1b, 0x40]); // ESC @
      expect(bytes.includes(Buffer.from([0x1d, 0x76, 0x30, 0x00]))).toBe(true); // raster image
      expect(bytes.length).toBeGreaterThan(2000);
    }
    expect(await leaseJobs(db, restaurant.id)).toHaveLength(0); // leased: not handed out twice
    await ackJob(db, restaurant.id, jobs[0]!.id, true);
    await ackJob(db, restaurant.id, jobs[1]!.id, false, "ECONNREFUSED");
    const after = await jobsOf();
    expect(after.find((j) => j.id === jobs[0]!.id)?.status).toBe("done");
    expect(after.find((j) => j.id === jobs[1]!.id)).toMatchObject({
      status: "pending",
      error: "ECONNREFUSED",
    });

    // Without acceptance, a guest order is sent to the kitchen right away (the bar gets the tea).
    await setCashierAcceptance(db, ctx, false);
    const [s] = await db
      .select()
      .from(restaurantSettings)
      .where(eq(restaurantSettings.restaurantId, restaurant.id));
    expect(s?.cashierAcceptance).toBe(false);
    await guestOrder(table.qrToken, [tea.id]);
    expect((await jobsOf()).length).toBe(4);
  });

  it("gives team members a job preset and their station", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant("Jobs", { plan: "professional" });
    const station = await saveStation(db, ctx, null, { name: "Bar", color: "sky", categoryIds: [] });
    const { user, sessionUser } = await createUser();
    await addMember(restaurant.id, user.id, "staff");
    const [m] = await db.select().from(restaurantMembers).where(eq(restaurantMembers.userId, user.id));
    await setMemberJob(db, ctx, m!.id, { job: "bar", stationId: station });
    const barCtx = await loadRestaurantContext(db, sessionUser, restaurant.id);
    expect(barCtx.job).toBe("bar");
    expect(barCtx.stationId).toBe(station);
    expect(barCtx.permissions.has("orders.view")).toBe(true);
    expect(barCtx.permissions.has("orders.create")).toBe(false);
    expect(barCtx.permissions.has("payments.record")).toBe(false);
    await setMemberJob(db, ctx, m!.id, { job: "manager", stationId: null });
    const mgr = await loadRestaurantContext(db, sessionUser, restaurant.id);
    expect(mgr.role).toBe("admin");
    expect(mgr.stationId).toBeNull();
  });
});
