import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { coupons, feedbackRequests, notifications, reviews } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createPosOrder } from "@/server/modules/pos/service";
import { updateOrderStatus } from "@/server/modules/orders/service";
import { setSmsDriver } from "@/server/infra/sms";
import {
  drawPrize,
  getFeedbackOverview,
  getFeedbackPage,
  sendDueFeedback,
  spinWheel,
  submitFeedback,
  updateFeedbackSettings,
} from "@/server/modules/feedback/service";
import { createOwnerWithRestaurant } from "../helpers/factories";

const sent: { to: string; text: string }[] = [];
afterEach(() => {
  sent.length = 0;
  setSmsDriver(null);
});

async function servedOrder(phone: string | null, opts: { wheel?: boolean } = {}) {
  setSmsDriver({ name: "test", send: async (to, text) => (sent.push({ to, text }), { ref: null }) });
  const o = await createOwnerWithRestaurant("Avis");
  await updateFeedbackSettings(db, o.ctx, {
    feedbackSmsEnabled: true,
    feedbackDelayMinutes: 30,
    wheelEnabled: opts.wheel ?? false,
    wheelPrizes: [
      { label: "10 %", kind: "percent", value: 10, weight: 1 },
      { label: "Perdu", kind: "none", value: 0, weight: 3 },
    ],
  });
  const cat = await createCategory(db, o.ctx, { name: "Plats" });
  const dish = await createProduct(db, o.ctx, { categoryId: cat.id, name: "Kebab", priceCents: 1000 });
  const { order } = await createPosOrder(db, o.ctx, {
    lines: [{ productId: dish.id, quantity: 1 }],
    customerPhone: phone ?? undefined,
    payment: { provider: "cash" },
    idempotencyKey: randomBytes(12).toString("hex"),
  });
  if (order.status !== "served") await updateOrderStatus(db, o.ctx, order.id, "served");
  return { ...o, order };
}

describe("satisfaction", () => {
  it("texts a survey once, after the delay, only for orders with a phone", async () => {
    const { ctx, order } = await servedOrder("09351230000");
    const [f] = await db.select().from(feedbackRequests).where(eq(feedbackRequests.orderId, order.id));
    expect(f).toBeTruthy();
    expect(await sendDueFeedback(db, ctx.restaurant.id)).toBe(0);
    const later = new Date(Date.now() + 31 * 60_000);
    expect(await sendDueFeedback(db, ctx.restaurant.id, later)).toBe(1);
    expect(await sendDueFeedback(db, ctx.restaurant.id, later)).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("09351230000");
    expect(sent[0]!.text).toContain(`/f/${f!.token}`);

    const none = await servedOrder(null);
    expect(
      await db.select().from(feedbackRequests).where(eq(feedbackRequests.orderId, none.order.id)),
    ).toHaveLength(0);
  });

  it("a low rating alerts the team and is recorded as a review, once", async () => {
    const { ctx, order } = await servedOrder("09351230000");
    const [f] = await db.select().from(feedbackRequests).where(eq(feedbackRequests.orderId, order.id));
    await submitFeedback(db, f!.token, { rating: 2, comment: "Froid" });
    await expect(submitFeedback(db, f!.token, { rating: 5 })).rejects.toMatchObject({
      message: "already_answered",
    });
    const alerts = await db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.restaurantId, ctx.restaurant.id), eq(notifications.type, "feedback.unhappy")),
      );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.payload).toMatchObject({ rating: 2, comment: "Froid" });
    const rv = await db.select().from(reviews).where(eq(reviews.orderId, order.id));
    expect(rv[0]).toMatchObject({ rating: 2 });
    const overview = await getFeedbackOverview(db, ctx);
    expect(overview).toMatchObject({ answered: 1, unhappy: 1, average: 2 });
  });

  it("the wheel spins once after rating and a win is a single-use coupon", async () => {
    const { ctx, order } = await servedOrder("09351230000", { wheel: true });
    const [f] = await db.select().from(feedbackRequests).where(eq(feedbackRequests.orderId, order.id));
    expect((await getFeedbackPage(db, f!.token))!.wheel).toEqual(["10 %", "Perdu"]);
    await expect(spinWheel(db, f!.token, () => 0)).rejects.toMatchObject({ message: "rate_first" });
    await submitFeedback(db, f!.token, { rating: 5 });
    const won = await spinWheel(db, f!.token, () => 0);
    expect(won).toMatchObject({ index: 0, label: "10 %" });
    expect(won.couponCode).toMatch(/^WIN-/);
    const [c] = await db.select().from(coupons).where(eq(coupons.code, won.couponCode!));
    expect(c).toMatchObject({ restaurantId: ctx.restaurant.id, kind: "percent", value: 10, maxUses: 1 });
    // Spinning again shows the same prize.
    expect(await spinWheel(db, f!.token, () => 3)).toMatchObject({ couponCode: won.couponCode });
  });

  it("draws by weight", () => {
    const prizes = [
      { label: "a", kind: "none" as const, value: 0, weight: 1 },
      { label: "b", kind: "none" as const, value: 0, weight: 3 },
    ];
    expect(drawPrize(prizes, () => 0)).toBe(0);
    expect(drawPrize(prizes, () => 1)).toBe(1);
    expect(drawPrize(prizes, () => 3)).toBe(1);
  });
});
