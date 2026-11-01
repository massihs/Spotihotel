"use server";

import { callWaiter } from "@/server/modules/guest/waiter";
import { restaurantNowPlaying } from "@/server/modules/music/service";
import { findUsableCoupon } from "@/server/modules/customers/service";
import { validation } from "@/server/errors";
import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { getCurrentDiner } from "@/server/auth/diner";
import { runAction } from "@/server/actions";
import { enforceRateLimit } from "@/server/infra/rate-limit";
import { requireGuest } from "@/server/modules/guest/current";
import { renameParticipant } from "@/server/modules/guest/sessions";
import { placeOrder } from "@/server/modules/orders/service";
import {
  cancelGuestPayment,
  requestPaymentAtTable,
  startOnlinePayment,
} from "@/server/modules/payments/service";
import { env } from "@/server/env";
import { issueInvoiceAsGuest } from "@/server/modules/invoices/service";
import { routing } from "@/i18n/routing";
import { getLocale } from "next-intl/server";
import {
  addToCart,
  getCartView,
  removeCartItem,
  setCartItemNote,
  setCartItemQuantity,
  type AddItemInput,
} from "@/server/modules/cart/service";

async function guest() {
  const g = await requireGuest();
  await enforceRateLimit("guestWrite", g.guestId);
  return g;
}

/** Returns the new cart summary so the menu's cart bar updates without a reload. */
/** Count, total and units per product: what the menu needs to reflect the cart. */
function cartSummary(cart: Awaited<ReturnType<typeof getCartView>>) {
  const byProduct: Record<string, number> = {};
  for (const l of cart.lines) byProduct[l.productId] = (byProduct[l.productId] ?? 0) + l.quantity;
  return { itemCount: cart.itemCount, totalCents: cart.totals.totalCents, byProduct };
}

export async function addToCartAction(input: AddItemInput) {
  return runAction(async () => {
    const g = await guest();
    await addToCart(db, g, input);
    return cartSummary(await getCartView(db, g));
  });
}

export async function setQuantityAction(itemId: string, quantity: number) {
  return runAction(async () => {
    const g = await guest();
    await setCartItemQuantity(db, g, itemId, quantity);
    refresh();
  });
}

export async function removeItemAction(itemId: string) {
  return runAction(async () => {
    const g = await guest();
    await removeCartItem(db, g, itemId);
    refresh();
  });
}

export async function setNoteAction(itemId: string, note: string) {
  return runAction(async () => {
    const g = await guest();
    await setCartItemNote(db, g, itemId, note);
    refresh();
  });
}

export async function renameAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const g = await guest();
    const name = await renameParticipant(db, g, String(fd.get("displayName") ?? ""));
    refresh();
    return { name };
  });
}

/** Sends the cart to the kitchen. Prices are recomputed server-side inside placeOrder. */
export async function placeOrderAction(note: string, phone = "", couponCode = "") {
  return runAction(async () => {
    const g = await guest();
    const diner = await getCurrentDiner();
    const order = await placeOrder(db, g, { note, phone, couponCode }, { dinerId: diner?.id });
    return { number: order.number };
  });
}

/**
 * Starts an online checkout for what this guest owes (amount computed server-side) and
 * returns the PSP URL to redirect to.
 */
export async function startOnlinePaymentAction(provider: string, idempotencyKey: string) {
  return runAction(async () => {
    const g = await guest();
    const locale = await getLocale();
    const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    const result = await startOnlinePayment(
      db,
      g,
      { provider: provider as "stripe", idempotencyKey },
      { returnUrl: `${env().APP_URL}${prefix}/table/orders` },
    );
    return { redirectUrl: result.redirectUrl };
  });
}

export async function cancelPaymentAction(paymentId: string) {
  return runAction(async () => {
    const g = await guest();
    await cancelGuestPayment(db, g, paymentId);
    refresh();
  });
}

/** "Pay at the table": the team is notified with the amount and preferred method. */
export async function requestPaymentAction(method: "cash" | "card" | "any") {
  return runAction(async () => {
    const g = await guest();
    await enforceRateLimit("paymentRequest", g.participant.id);
    return requestPaymentAtTable(db, g, { method });
  });
}

/** The guest's invoice for one of their payments (issued once, then reused). */
export async function getInvoiceAction(paymentId: string) {
  return runAction(async () => {
    const g = await guest();
    const invoice = await issueInvoiceAsGuest(db, g, paymentId);
    return { token: invoice.publicToken };
  });
}

/** Checks a promo code for the cart (the discount is applied again server-side at checkout). */
export async function checkCouponAction(code: string) {
  return runAction(async () => {
    const g = await guest();
    const c = await findUsableCoupon(db, g.restaurant.id, code);
    if (!c) throw validation("coupon_invalid");
    return { code: c.code, kind: c.kind, value: c.value, minOrderCents: c.minOrderCents };
  });
}

/** The song playing in the restaurant right now (null when the music is off). */
export async function nowPlayingAction() {
  return runAction(async () => {
    const g = await guest();
    return restaurantNowPlaying(db, g.restaurant.id);
  });
}

/** Calls a waiter / asks for the bill / water from the table. */
export async function callWaiterAction(kind: string, note: string | null = null) {
  return runAction(async () => {
    const g = await guest();
    await callWaiter(db, g, kind, new Date(), typeof note === "string" ? note : null);
  });
}
