"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
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
export async function addToCartAction(input: AddItemInput) {
  return runAction(async () => {
    const g = await guest();
    await addToCart(db, g, input);
    const cart = await getCartView(db, g);
    return { itemCount: cart.itemCount, totalCents: cart.totals.totalCents };
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
export async function placeOrderAction(note: string) {
  return runAction(async () => {
    const g = await guest();
    const order = await placeOrder(db, g, { note });
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
