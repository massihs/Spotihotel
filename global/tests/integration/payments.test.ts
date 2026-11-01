import { createHmac, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { notifications, orders, payments, refunds, restaurantSettings } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createTable } from "@/server/modules/tables/service";
import { enterTableByQr, loadGuestContext, type GuestContext } from "@/server/modules/guest/sessions";
import { addToCart } from "@/server/modules/cart/service";
import { placeOrder } from "@/server/modules/orders/service";
import {
  cancelGuestPayment,
  confirmPayment,
  getGuestPaymentState,
  handleWebhook,
  listPayments,
  newIdempotencyKey,
  recordStaffPayment,
  refundPayment,
  updatePaymentSettings,
  requestPaymentAtTable,
  startOnlinePayment,
} from "@/server/modules/payments/service";
import { setPaymentProvider } from "@/server/infra/payments/registry";
import { stripeProvider, verifyStripeSignature } from "@/server/infra/payments/stripe";
import type { PaymentProvider } from "@/server/infra/payments/types";
import { closeTableSession } from "@/server/modules/floor/service";
import { addMember, contextFor, createOwnerWithRestaurant, createUser } from "../helpers/factories";

const WEBHOOK_SECRET = "whsec_test_secret";
const RETURN = "http://localhost:3000/table/orders";

beforeAll(() => {
  process.env.ENABLE_MOCK_PAYMENTS = "1";
  process.env.STRIPE_SECRET_KEY = "sk_test_fake";
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

afterEach(() => setPaymentProvider("stripe", stripeProvider));

/** Stripe stand-in: real webhook parsing/signature, fake checkout creation (no network). */
const fakeStripe: PaymentProvider = {
  ...stripeProvider,
  async createPayment(input) {
    return {
      status: "requires_action",
      redirectUrl: `https://checkout.test/${input.paymentId}`,
      providerRef: `cs_${input.paymentId}`,
    };
  },
  async refund() {
    return { providerRef: `re_${randomUUID()}` };
  },
};

function signedStripe(body: object, secret = WEBHOOK_SECRET, t = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify(body);
  const sig = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return { raw, headers: new Headers({ "stripe-signature": `t=${t},v1=${sig}` }) };
}

function completed(paymentId: string, amount: number) {
  return {
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_${paymentId}`,
        client_reference_id: paymentId,
        payment_status: "paid",
        amount_total: amount,
        payment_intent: "pi_123",
      },
    },
  };
}

async function setup(opts: { online?: boolean; plan?: string; requirePayment?: boolean } = {}) {
  const owner = await createOwnerWithRestaurant("Payeur", { plan: opts.plan ?? "professional" });
  await db
    .update(restaurantSettings)
    .set({
      onlinePaymentEnabled: opts.online ?? true,
      enabledPaymentProviders: ["cash", "on_site_terminal", "pay_later", "stripe", "mock_online"],
      requirePaymentBeforeOrder: opts.requirePayment ?? false,
    })
    .where(eq(restaurantSettings.restaurantId, owner.restaurant.id));
  const table = await createTable(db, owner.ctx, { label: "12" });
  const cat = await createCategory(db, owner.ctx, { name: "Plats" });
  const burger = await createProduct(db, owner.ctx, { categoryId: cat.id, name: "Burger", priceCents: 2000 });
  const coca = await createProduct(db, owner.ctx, { categoryId: cat.id, name: "Coca", priceCents: 500 });
  return { owner, table, burger, coca };
}

async function seat(qrToken: string): Promise<GuestContext> {
  const guestId = randomUUID();
  const e = await enterTableByQr(db, qrToken, guestId);
  return (await loadGuestContext(db, guestId, e!.participant.id))!;
}

async function order(g: GuestContext, productId: string, quantity = 1) {
  await addToCart(db, g, { productId, optionValueIds: [], quantity });
  return placeOrder(db, g);
}

describe("guest online payment", () => {
  it("charges the server-computed due amount, once, and marks orders paid on webhook", async () => {
    setPaymentProvider("stripe", fakeStripe);
    const { owner, table, burger, coca } = await setup();
    const g = await seat(table.qrToken);
    const other = await seat(table.qrToken);
    await order(g, burger.id, 2); // 40.00
    await order(g, coca.id); // 5.00
    await order(other, burger.id); // someone else's bill

    const state = await getGuestPaymentState(db, g);
    expect(state.dueCents).toBe(4500);
    expect(state.methods.online).toEqual(["stripe", "mock_online"]);

    const key = newIdempotencyKey();
    const start = await startOnlinePayment(
      db,
      g,
      { provider: "stripe", idempotencyKey: key },
      { returnUrl: RETURN },
    );
    expect(start.redirectUrl).toContain("checkout.test");
    // Double tap: same checkout, no second payment.
    const again = await startOnlinePayment(
      db,
      g,
      { provider: "stripe", idempotencyKey: key },
      { returnUrl: RETURN },
    );
    expect(again.paymentId).toBe(start.paymentId);

    const [p] = await db.select().from(payments).where(eq(payments.id, start.paymentId));
    expect(p).toMatchObject({
      amountCents: 4500,
      status: "requires_action",
      participantId: g.participant.id,
    });
    expect((await getGuestPaymentState(db, g)).dueCents).toBe(0); // locked while pending

    const { raw, headers } = signedStripe(completed(start.paymentId, 4500));
    expect(await handleWebhook(db, "stripe", raw, headers)).toEqual({ handled: true });
    // Webhook retried by Stripe: applied once.
    await handleWebhook(db, "stripe", raw, headers);

    const mine = await db.select().from(orders).where(eq(orders.participantId, g.participant.id));
    expect(mine.every((o) => o.paymentStatus === "paid")).toBe(true);
    const theirs = await db.select().from(orders).where(eq(orders.participantId, other.participant.id));
    expect(theirs[0]!.paymentStatus).toBe("unpaid");
    const [done] = await db.select().from(payments).where(eq(payments.id, start.paymentId));
    expect(done).toMatchObject({
      status: "succeeded",
      metadata: expect.objectContaining({ paymentIntent: "pi_123" }),
    });
    const notes = await db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.restaurantId, owner.restaurant.id), eq(notifications.type, "payment.received")),
      );
    expect(notes).toHaveLength(1);
  });

  it("rejects bad signatures, replays and amount mismatches", async () => {
    setPaymentProvider("stripe", fakeStripe);
    const { table, burger } = await setup();
    const g = await seat(table.qrToken);
    await order(g, burger.id);
    const start = await startOnlinePayment(
      db,
      g,
      { provider: "stripe", idempotencyKey: newIdempotencyKey() },
      { returnUrl: RETURN },
    );

    const forged = signedStripe(completed(start.paymentId, 2000), "whsec_wrong");
    await expect(handleWebhook(db, "stripe", forged.raw, forged.headers)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    const old = signedStripe(
      completed(start.paymentId, 2000),
      WEBHOOK_SECRET,
      Math.floor(Date.now() / 1000) - 3600,
    );
    await expect(handleWebhook(db, "stripe", old.raw, old.headers)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });

    const wrongAmount = signedStripe(completed(start.paymentId, 1));
    await handleWebhook(db, "stripe", wrongAmount.raw, wrongAmount.headers);
    const [p] = await db.select().from(payments).where(eq(payments.id, start.paymentId));
    expect(p!.status).toBe("requires_action");

    // Unknown payment id: acknowledged, nothing happens.
    const unknown = signedStripe(completed(randomUUID(), 2000));
    expect(await handleWebhook(db, "stripe", unknown.raw, unknown.headers)).toEqual({ handled: false });
  });

  it("a failed / cancelled checkout releases the orders; a late success is still honoured", async () => {
    const { table, burger } = await setup();
    const g = await seat(table.qrToken);
    await order(g, burger.id);
    const start = await startOnlinePayment(
      db,
      g,
      { provider: "mock_online", idempotencyKey: newIdempotencyKey() },
      { returnUrl: RETURN },
    );
    expect(start.redirectUrl).toContain(`/pay/mock/${start.paymentId}`);
    await cancelGuestPayment(db, g, start.paymentId);
    expect((await getGuestPaymentState(db, g)).dueCents).toBe(2000);

    const late = await confirmPayment(db, {
      paymentId: start.paymentId,
      provider: "mock_online",
      providerRef: null,
    });
    expect(late.applied).toBe(true);
    expect((await getGuestPaymentState(db, g)).dueCents).toBe(0);
    // Provider mismatch never confirms.
    await expect(
      confirmPayment(db, { paymentId: start.paymentId, provider: "stripe", providerRef: null }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is refused when online payment is off or not in the plan", async () => {
    const off = await setup({ online: false });
    const g1 = await seat(off.table.qrToken);
    await order(g1, off.burger.id);
    expect((await getGuestPaymentState(db, g1)).methods.online).toEqual([]);
    await expect(
      startOnlinePayment(
        db,
        g1,
        { provider: "mock_online", idempotencyKey: newIdempotencyKey() },
        { returnUrl: RETURN },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const free = await setup({ plan: "free" });
    const g2 = await seat(free.table.qrToken);
    await order(g2, free.burger.id);
    await expect(
      startOnlinePayment(
        db,
        g2,
        { provider: "mock_online", idempotencyKey: newIdempotencyKey() },
        { returnUrl: RETURN },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("orders waiting for payment go to the kitchen once paid", async () => {
    const { table, burger } = await setup({ requirePayment: true });
    const g = await seat(table.qrToken);
    const o = await order(g, burger.id);
    expect(o.status).toBe("pending_payment");
    const start = await startOnlinePayment(
      db,
      g,
      { provider: "mock_online", idempotencyKey: newIdempotencyKey() },
      { returnUrl: RETURN },
    );
    await confirmPayment(db, { paymentId: start.paymentId, provider: "mock_online", providerRef: null });
    const [after] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(after).toMatchObject({ status: "received", paymentStatus: "paid" });
  });

  it("pay at the table notifies the team", async () => {
    const { owner, table, burger } = await setup();
    const g = await seat(table.qrToken);
    await expect(requestPaymentAtTable(db, g)).rejects.toMatchObject({ code: "CONFLICT" });
    await order(g, burger.id);
    expect(await requestPaymentAtTable(db, g, { method: "card" })).toEqual({ dueCents: 2000 });
    const [n] = await db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.restaurantId, owner.restaurant.id), eq(notifications.type, "payment.requested")),
      );
    expect(n!.payload).toMatchObject({ tableLabel: "12", amountCents: 2000, method: "card" });
  });
});

describe("staff payments", () => {
  it("records cash per guest or for the whole table, and the table can then be closed", async () => {
    const { owner, table, burger, coca } = await setup();
    const a = await seat(table.qrToken);
    const b = await seat(table.qrToken);
    const oa = await order(a, burger.id);
    await order(b, coca.id, 2);

    const s = await createUser();
    await addMember(owner.restaurant.id, s.user.id, "staff");
    const staff = await contextFor(s.sessionUser, owner.restaurant.id);

    await expect(
      recordStaffPayment(db, staff, {
        tableSessionId: a.session.id,
        participantId: a.participant.id,
        provider: "cash",
        tenderedCents: 1000,
        idempotencyKey: newIdempotencyKey(),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const key = newIdempotencyKey();
    const pa = await recordStaffPayment(db, staff, {
      tableSessionId: a.session.id,
      participantId: a.participant.id,
      provider: "cash",
      tenderedCents: 5000,
      idempotencyKey: key,
    });
    expect(pa).toMatchObject({ amountCents: 2000, status: "succeeded", recordedByUserId: s.user.id });
    // Same submission twice → same payment.
    const dup = await recordStaffPayment(db, staff, {
      tableSessionId: a.session.id,
      participantId: a.participant.id,
      provider: "cash",
      idempotencyKey: key,
    });
    expect(dup.id).toBe(pa.id);
    await expect(
      recordStaffPayment(db, staff, {
        tableSessionId: a.session.id,
        participantId: a.participant.id,
        provider: "on_site_terminal",
        idempotencyKey: newIdempotencyKey(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "nothing_to_pay" });

    const pt = await recordStaffPayment(db, staff, {
      tableSessionId: a.session.id,
      provider: "on_site_terminal",
      idempotencyKey: newIdempotencyKey(),
    });
    expect(pt.amountCents).toBe(1000); // only what remained (b's drinks)
    const [paid] = await db.select().from(orders).where(eq(orders.id, oa.id));
    expect(paid!.paymentStatus).toBe("paid");

    // Staff cannot refund by default.
    await expect(refundPayment(db, staff, pa.id, { amountCents: 100 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // Close: orders must be served first; force (owner) works now that everything is paid.
    await closeTableSession(db, owner.ctx, table.id, { force: true });
  });

  it("refunds partially then totally, never beyond what was paid", async () => {
    setPaymentProvider("stripe", fakeStripe);
    const { owner, table, burger } = await setup();
    const g = await seat(table.qrToken);
    const o = await order(g, burger.id);
    const start = await startOnlinePayment(
      db,
      g,
      { provider: "stripe", idempotencyKey: newIdempotencyKey() },
      { returnUrl: RETURN },
    );
    const { raw, headers } = signedStripe(completed(start.paymentId, 2000));
    await handleWebhook(db, "stripe", raw, headers);

    await refundPayment(db, owner.ctx, start.paymentId, { amountCents: 500, reason: "Plat froid" });
    let [p] = await db.select().from(payments).where(eq(payments.id, start.paymentId));
    expect(p).toMatchObject({ status: "partially_refunded", refundedCents: 500 });
    let [ord] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(ord!.paymentStatus).toBe("partially_refunded");

    await expect(refundPayment(db, owner.ctx, start.paymentId, { amountCents: 1600 })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await refundPayment(db, owner.ctx, start.paymentId, { amountCents: 1500 });
    [p] = await db.select().from(payments).where(eq(payments.id, start.paymentId));
    expect(p).toMatchObject({ status: "refunded", refundedCents: 2000 });
    [ord] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(ord!.paymentStatus).toBe("refunded");
    const rs = await db.select().from(refunds).where(eq(refunds.paymentId, start.paymentId));
    expect(rs.map((r) => r.status)).toEqual(["succeeded", "succeeded"]);
    await expect(refundPayment(db, owner.ctx, start.paymentId, { amountCents: 1 })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("a PSP refund failure releases the reserved amount", async () => {
    setPaymentProvider("stripe", {
      ...fakeStripe,
      async refund() {
        throw new Error("card_declined");
      },
    });
    const { owner, table, burger } = await setup();
    const g = await seat(table.qrToken);
    await order(g, burger.id);
    const start = await startOnlinePayment(
      db,
      g,
      { provider: "stripe", idempotencyKey: newIdempotencyKey() },
      { returnUrl: RETURN },
    );
    const { raw, headers } = signedStripe(completed(start.paymentId, 2000));
    await handleWebhook(db, "stripe", raw, headers);
    await expect(refundPayment(db, owner.ctx, start.paymentId, { amountCents: 2000 })).rejects.toMatchObject({
      message: "refund_provider_error",
    });
    const [p] = await db.select().from(payments).where(eq(payments.id, start.paymentId));
    expect(p).toMatchObject({ status: "succeeded", refundedCents: 0 });
  });

  it("concurrent cash payments for the same guest collect once", async () => {
    const { owner, table, burger } = await setup();
    const g = await seat(table.qrToken);
    await order(g, burger.id);
    const results = await Promise.allSettled(
      [0, 1, 2].map(() =>
        recordStaffPayment(db, owner.ctx, {
          tableSessionId: g.session.id,
          participantId: g.participant.id,
          provider: "cash",
          idempotencyKey: newIdempotencyKey(),
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const list = await listPayments(db, owner.ctx);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      amountCents: 2000,
      tableLabel: "12",
      orderNumbers: [expect.any(String)],
    });
  });

  it("is tenant-isolated", async () => {
    const { table, burger } = await setup();
    const g = await seat(table.qrToken);
    await order(g, burger.id);
    const intruder = await createOwnerWithRestaurant("Ailleurs");
    await expect(
      recordStaffPayment(db, intruder.ctx, {
        tableSessionId: g.session.id,
        provider: "cash",
        idempotencyKey: newIdempotencyKey(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listPayments(db, intruder.ctx)).toEqual([]);
  });
});

describe("stripe signature", () => {
  it("verifies v1 signatures with tolerance", () => {
    const now = 1_800_000_000;
    const body = '{"a":1}';
    const sig = createHmac("sha256", "s").update(`${now}.${body}`).digest("hex");
    expect(verifyStripeSignature(body, `t=${now},v1=${sig}`, "s", now)).toBe(true);
    expect(verifyStripeSignature(body, `t=${now},v1=deadbeef,v1=${sig}`, "s", now)).toBe(true);
    expect(verifyStripeSignature(body + " ", `t=${now},v1=${sig}`, "s", now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${now},v1=${sig}`, "s", now + 301)).toBe(false);
    expect(verifyStripeSignature(body, null, "s", now)).toBe(false);
    expect(verifyStripeSignature(body, "garbage", "s", now)).toBe(false);
  });
});

describe("payment settings", () => {
  it("enforces plan, provider availability and at least one method", async () => {
    const free = await createOwnerWithRestaurant("Gratuit", { plan: "free" });
    await expect(
      updatePaymentSettings(db, free.ctx, {
        onlinePaymentEnabled: true,
        enabledPaymentProviders: ["mock_online"],
        requirePaymentBeforeOrder: false,
      }),
    ).rejects.toMatchObject({ code: "PLAN_LIMIT" });

    const pro = await createOwnerWithRestaurant("Pro", { plan: "professional" });
    await expect(
      updatePaymentSettings(db, pro.ctx, {
        onlinePaymentEnabled: false,
        enabledPaymentProviders: [],
        requirePaymentBeforeOrder: false,
      }),
    ).rejects.toMatchObject({ message: "payment_method_required" });
    await expect(
      updatePaymentSettings(db, pro.ctx, {
        onlinePaymentEnabled: true,
        enabledPaymentProviders: ["cash"],
        requirePaymentBeforeOrder: false,
      }),
    ).rejects.toMatchObject({ message: "online_provider_required" });
    await expect(
      updatePaymentSettings(db, pro.ctx, {
        onlinePaymentEnabled: false,
        enabledPaymentProviders: ["bitcoin" as "cash"],
        requirePaymentBeforeOrder: false,
      }),
    ).rejects.toThrow();
    const saved = await updatePaymentSettings(db, pro.ctx, {
      onlinePaymentEnabled: true,
      enabledPaymentProviders: ["cash", "mock_online", "cash"],
      requirePaymentBeforeOrder: true,
    });
    expect(saved).toMatchObject({
      onlinePaymentEnabled: true,
      enabledPaymentProviders: ["cash", "mock_online"],
      requirePaymentBeforeOrder: true,
    });

    const s = await createUser();
    await addMember(pro.restaurant.id, s.user.id, "staff");
    const staff = await contextFor(s.sessionUser, pro.restaurant.id);
    await expect(
      updatePaymentSettings(db, staff, {
        onlinePaymentEnabled: false,
        enabledPaymentProviders: ["cash"],
        requirePaymentBeforeOrder: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
