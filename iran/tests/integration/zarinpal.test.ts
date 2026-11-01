import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// This file runs as the Iran edition (Zarinpal offered, IRR, Persian).
vi.mock("@/config/edition", async (orig) => {
  const mod = await orig<typeof import("@/config/edition")>();
  return { ...mod, EDITION: "iran", edition: mod.editionConfig("iran") };
});

const { db } = await import("@/server/db/client");
const { orders, payments, restaurants, restaurantSettings } = await import("@/server/db/schema");
const { createCategory } = await import("@/server/modules/menu/categories");
const { createProduct } = await import("@/server/modules/menu/products");
const { createTable } = await import("@/server/modules/tables/service");
const { enterTableByQr, loadGuestContext } = await import("@/server/modules/guest/sessions");
const { addToCart } = await import("@/server/modules/cart/service");
const { placeOrder } = await import("@/server/modules/orders/service");
const { getGuestPaymentState, handlePaymentReturn, newIdempotencyKey, startOnlinePayment } =
  await import("@/server/modules/payments/service");
const { createOwnerWithRestaurant } = await import("../helpers/factories");

const RETURN = "http://localhost:3000/table/orders";
type Call = { url: string; body: Record<string, unknown> };
let calls: Call[] = [];
let AUTH = "";

function zarinpalApi(verify: { code: number } | { error: string }) {
  calls = [];
  AUTH = `A${randomUUID().replaceAll("-", "")}`;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push({ url, body });
    if (url.endsWith("/request.json"))
      return Response.json({
        data: { code: 100, message: "Success", authority: AUTH },
        errors: [],
      });
    if ("code" in verify)
      return Response.json({
        data: { code: verify.code, ref_id: 201, card_pan: "502229******5995" },
        errors: [],
      });
    return Response.json({ data: [], errors: { code: -51, message: verify.error } });
  });
}

beforeAll(() => {
  process.env.ZARINPAL_MERCHANT_ID = "00000000-0000-0000-0000-000000000000";
});
afterEach(() => vi.unstubAllGlobals());

async function setup() {
  const owner = await createOwnerWithRestaurant("رستوران تست", { plan: "professional" });
  await db
    .update(restaurantSettings)
    .set({ onlinePaymentEnabled: true, enabledPaymentProviders: ["cash", "zarinpal"] })
    .where(eq(restaurantSettings.restaurantId, owner.restaurant.id));
  const table = await createTable(db, owner.ctx, { label: "۷" });
  const cat = await createCategory(db, owner.ctx, { name: "غذای اصلی" });
  // 4,500,000 rials (450,000 toman): 450,000,000 minor units per dish.
  const kabab = await createProduct(db, owner.ctx, {
    categoryId: cat.id,
    name: "چلوکباب",
    priceCents: 450_000_000,
  });
  const guestId = randomUUID();
  const e = await enterTableByQr(db, table.qrToken, guestId);
  const guest = (await loadGuestContext(db, guestId, e!.participant.id))!;
  return { owner, guest, kabab };
}

describe("Iran edition", () => {
  it("creates restaurants in IRR / Asia/Tehran / Persian with Iranian VAT", async () => {
    const { owner } = await setup();
    const [r] = await db.select().from(restaurants).where(eq(restaurants.id, owner.restaurant.id));
    expect(r).toMatchObject({ currency: "IRR", timezone: "Asia/Tehran", country: "IR", defaultLocale: "fa" });
  });

  it("handles large rial amounts end to end (bigint)", async () => {
    const { guest, kabab } = await setup();
    await addToCart(db, guest, { productId: kabab.id, optionValueIds: [], quantity: 60 }); // banquet
    const order = await placeOrder(db, guest);
    expect(order.totalCents).toBe(27_000_000_000); // 270M rials — beyond a 32-bit integer
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row!.totalCents).toBe(27_000_000_000);
    expect(row!.taxCents).toBe(2_454_545_455);
  });
});

describe("Zarinpal", () => {
  it("requests in rials, redirects to StartPay, verifies on return and marks orders paid", async () => {
    zarinpalApi({ code: 100 });
    const { guest, kabab } = await setup();
    await addToCart(db, guest, { productId: kabab.id, optionValueIds: [], quantity: 2 });
    await placeOrder(db, guest);
    expect((await getGuestPaymentState(db, guest)).methods.online).toEqual(["zarinpal"]);

    const start = await startOnlinePayment(
      db,
      guest,
      { provider: "zarinpal", idempotencyKey: newIdempotencyKey() },
      { returnUrl: RETURN },
    );
    expect(start.redirectUrl).toBe(`https://payment.zarinpal.com/pg/StartPay/${AUTH}`);
    expect(calls[0]!.body).toMatchObject({ amount: 9_000_000, currency: "IRR" });
    expect(String(calls[0]!.body.callback_url)).toContain(
      `/api/v1/payments/return/zarinpal?payment=${start.paymentId}`,
    );

    const back = new URLSearchParams({
      payment: start.paymentId,
      Authority: AUTH,
      Status: "OK",
    });
    const res = await handlePaymentReturn(db, "zarinpal", back);
    expect(res.returnUrl).toBe(`${RETURN}?payment=${start.paymentId}`);
    expect(calls[1]!.url).toContain("/verify.json");
    expect(calls[1]!.body).toMatchObject({
      amount: 9_000_000,
      authority: AUTH,
    });
    const [p] = await db.select().from(payments).where(eq(payments.id, start.paymentId));
    expect(p).toMatchObject({ status: "succeeded", metadata: expect.objectContaining({ refId: "201" }) });
    expect((await getGuestPaymentState(db, guest)).dueCents).toBe(0);

    // Refresh of the callback page: no second verification.
    await handlePaymentReturn(db, "zarinpal", back);
    expect(calls).toHaveLength(2);
  });

  it("never trusts the query string: wrong authority is ignored, NOK and failed verify release the orders", async () => {
    zarinpalApi({ error: "Session is not valid" });
    const { guest, kabab } = await setup();
    await addToCart(db, guest, { productId: kabab.id, optionValueIds: [], quantity: 1 });
    await placeOrder(db, guest);
    const start = await startOnlinePayment(
      db,
      guest,
      { provider: "zarinpal", idempotencyKey: newIdempotencyKey() },
      { returnUrl: RETURN },
    );

    // Forged "OK" with another authority: nothing happens, no verify call.
    await handlePaymentReturn(
      db,
      "zarinpal",
      new URLSearchParams({ payment: start.paymentId, Authority: "A_FORGED", Status: "OK" }),
    );
    expect(calls).toHaveLength(1);
    let [p] = await db.select().from(payments).where(eq(payments.id, start.paymentId));
    expect(p!.status).toBe("requires_action");

    // Status OK but Zarinpal says not paid.
    await handlePaymentReturn(
      db,
      "zarinpal",
      new URLSearchParams({
        payment: start.paymentId,
        Authority: AUTH,
        Status: "OK",
      }),
    );
    [p] = await db.select().from(payments).where(eq(payments.id, start.paymentId));
    expect(p).toMatchObject({ status: "failed" });
    expect((await getGuestPaymentState(db, guest)).dueCents).toBe(450_000_000);
  });
});

describe("Zarinpal merchant per restaurant", () => {
  const RESTO_MERCHANT = "11111111-2222-3333-4444-555555555555";

  it("pays into the restaurant's own merchant account, and verifies with the same one", async () => {
    zarinpalApi({ code: 100 });
    const { owner, guest, kabab } = await setup();
    await db
      .update(restaurantSettings)
      .set({ zarinpalMerchantId: RESTO_MERCHANT })
      .where(eq(restaurantSettings.restaurantId, owner.restaurant.id));
    await addToCart(db, guest, { productId: kabab.id, optionValueIds: [], quantity: 1 });
    await placeOrder(db, guest);
    const start = await startOnlinePayment(
      db,
      guest,
      { provider: "zarinpal", idempotencyKey: newIdempotencyKey() },
      { returnUrl: RETURN },
    );
    expect(calls[0]!.body.merchant_id).toBe(RESTO_MERCHANT);
    await handlePaymentReturn(
      db,
      "zarinpal",
      new URLSearchParams({ payment: start.paymentId, Authority: AUTH, Status: "OK" }),
    );
    expect(calls[1]!.body.merchant_id).toBe(RESTO_MERCHANT);
    const [p] = await db.select().from(payments).where(eq(payments.id, start.paymentId));
    expect(p).toMatchObject({
      status: "succeeded",
      metadata: expect.objectContaining({ merchantAccount: RESTO_MERCHANT }),
    });
  });

  it("requires a merchant id when there is no platform account, and validates it", async () => {
    const { updatePaymentSettings } = await import("@/server/modules/payments/service");
    const saved = process.env.ZARINPAL_MERCHANT_ID;
    delete process.env.ZARINPAL_MERCHANT_ID;
    try {
      const { owner } = await setup();
      const base = {
        onlinePaymentEnabled: true,
        enabledPaymentProviders: ["cash", "zarinpal"] as "cash"[],
        requirePaymentBeforeOrder: false,
      };
      await expect(updatePaymentSettings(db, owner.ctx, base)).rejects.toMatchObject({
        message: "zarinpal_merchant_required",
      });
      await expect(
        updatePaymentSettings(db, owner.ctx, { ...base, zarinpalMerchantId: "not-a-merchant" }),
      ).rejects.toThrow();
      const s = await updatePaymentSettings(db, owner.ctx, {
        ...base,
        zarinpalMerchantId: ` ${RESTO_MERCHANT.toUpperCase()} `,
      });
      expect(s.zarinpalMerchantId).toBe(RESTO_MERCHANT);
    } finally {
      process.env.ZARINPAL_MERCHANT_ID = saved;
    }
  });
});
