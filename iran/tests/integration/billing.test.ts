import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { subscriptions } from "@/server/db/schema";
import { getEntitlements } from "@/server/entitlements";
import {
  adminGrantPlan,
  completeCheckout,
  getBillingView,
  getSubscriptionNotice,
  priceFor,
  startCheckout,
} from "@/server/modules/billing/service";
import { createOwnerWithRestaurant, createUser } from "../helpers/factories";

const DAY = 86_400_000;

function mockZarinpal(verifyCode = 100) {
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const path = String(url).split("/").pop()!;
    const body = JSON.parse(String(init.body));
    calls.push({ path, body });
    if (path === "request.json") return Response.json({ data: { code: 100, authority: `A${calls.length}` } });
    return Response.json({ data: { code: verifyCode, ref_id: 12345, card_pan: "6037****1234" } });
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.BILLING_ZARINPAL_MERCHANT_ID;
});

describe("subscriptions", () => {
  it("is off without the platform merchant: Free plan, no banner, no checkout", async () => {
    const o = await createOwnerWithRestaurant("Off");
    expect((await getEntitlements(db, o.restaurant.id)).planCode).toBe("free");
    expect(await getSubscriptionNotice(db, o.restaurant.id)).toBeNull();
    await expect(startCheckout(db, o.ctx, { planCode: "starter", months: 1 })).rejects.toMatchObject({
      message: "billing_disabled",
    });
  });

  it("with the merchant: 14-day trial, then back to Free limits with a banner", async () => {
    process.env.BILLING_ZARINPAL_MERCHANT_ID = "test-merchant";
    const o = await createOwnerWithRestaurant("Trial");
    expect((await getEntitlements(db, o.restaurant.id)).planCode).toBe("professional");
    const notice = await getSubscriptionNotice(db, o.restaurant.id);
    expect(notice).toMatchObject({ kind: "trial", daysLeft: 14 });

    await db
      .update(subscriptions)
      .set({ currentPeriodEnd: new Date(Date.now() - DAY) })
      .where(eq(subscriptions.organizationId, o.organization.id));
    expect((await getEntitlements(db, o.restaurant.id)).planCode).toBe("free");
    expect(await getSubscriptionNotice(db, o.restaurant.id)).toMatchObject({
      kind: "expired",
      wasTrial: true,
    });
  });

  it("pays through Zarinpal, once, and extends the running period", async () => {
    process.env.BILLING_ZARINPAL_MERCHANT_ID = "test-merchant";
    const calls = mockZarinpal();
    const o = await createOwnerWithRestaurant("Pay");
    const start = await startCheckout(db, o.ctx, { planCode: "starter", months: 12 });
    expect(start.redirectUrl).toContain("/pg/StartPay/A1");
    const view0 = await getBillingView(db, o.ctx);
    const starter = view0.plans.find((p) => p.code === "starter")!;
    expect(calls[0]!.body).toMatchObject({
      merchant_id: "test-merchant",
      amount: priceFor(starter.priceMonthlyCents, 12) / 100,
    });

    const q = new URLSearchParams({ Authority: "A1", Status: "OK" });
    const now = new Date();
    await expect(completeCheckout(db, start.paymentId, q, now)).resolves.toMatchObject({ paid: true });
    // The return can come twice (refresh): applied once.
    await expect(completeCheckout(db, start.paymentId, q, now)).resolves.toMatchObject({ paid: true });

    const view = await getBillingView(db, o.ctx);
    expect(view.state).toMatchObject({ kind: "paid", planCode: "starter" });
    expect(view.history).toHaveLength(1);
    expect(view.history[0]!.invoiceNumber).toMatch(/^SF-\d{4}-\d{6}$/);
    const firstEnd = view.history[0]!.periodEnd!;
    expect(Math.round((firstEnd.getTime() - now.getTime()) / DAY)).toBeGreaterThanOrEqual(365);
    expect((await getEntitlements(db, o.restaurant.id)).planCode).toBe("starter");

    // A second month starts where the first period ends.
    const again = await startCheckout(db, o.ctx, { planCode: "starter", months: 1 });
    await completeCheckout(db, again.paymentId, new URLSearchParams({ Authority: "A3", Status: "OK" }), now);
    const v2 = await getBillingView(db, o.ctx);
    expect(v2.history[0]!.periodStart!.getTime()).toBe(firstEnd.getTime());
    expect(v2.history[0]!.invoiceNumber).not.toBe(view.history[0]!.invoiceNumber);
  });

  it("a declined or tampered return extends nothing", async () => {
    process.env.BILLING_ZARINPAL_MERCHANT_ID = "test-merchant";
    mockZarinpal();
    const o = await createOwnerWithRestaurant("Nok");
    const s = await startCheckout(db, o.ctx, { planCode: "starter", months: 1 });
    // Another authority than ours is ignored.
    await expect(
      completeCheckout(db, s.paymentId, new URLSearchParams({ Authority: "X", Status: "OK" })),
    ).resolves.toMatchObject({ paid: false });
    await expect(
      completeCheckout(db, s.paymentId, new URLSearchParams({ Authority: "A1", Status: "NOK" })),
    ).resolves.toMatchObject({ paid: false });
    const view = await getBillingView(db, o.ctx);
    expect(view.state.kind).toBe("trial");
    expect(view.history[0]).toMatchObject({ status: "failed" });
  });

  it("the admin grants a period by hand, with an invoice", async () => {
    const o = await createOwnerWithRestaurant("Grant");
    const { user: admin } = await createUser({ superAdmin: true });
    const res = await adminGrantPlan(db, admin.id, {
      restaurantId: o.restaurant.id,
      planCode: "professional",
      months: 3,
      amountCents: 5_000_000,
    });
    expect(res.invoiceNumber).toMatch(/^SF-/);
    expect((await getEntitlements(db, o.restaurant.id)).planCode).toBe("professional");
    await adminGrantPlan(db, admin.id, { restaurantId: o.restaurant.id, planCode: "free", months: 0 });
    expect((await getEntitlements(db, o.restaurant.id)).planCode).toBe("free");
  });
});
