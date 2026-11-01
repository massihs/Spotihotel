"use server";

import { db } from "@/server/db/client";
import { runAction } from "@/server/actions";
import { getCurrentDiner } from "@/server/auth/diner";
import { unauthenticated } from "@/server/errors";
import { enforceRateLimit } from "@/server/infra/rate-limit";
import { placeKioskOrder, placeOnlineOrder } from "@/server/modules/online/service";

export async function placeOnlineOrderAction(slug: string, input: unknown) {
  return runAction(async () => {
    const diner = await getCurrentDiner();
    if (!diner) throw unauthenticated("sign_in_required");
    await enforceRateLimit("qrEntry", `online:${diner.id}`);
    const order = await placeOnlineOrder(db, { id: diner.id, phone: diner.phone }, slug, input);
    return { orderId: order.id };
  });
}

/** The counter tablet: no sign-in, the kiosk link is the credential. */
export async function placeKioskOrderAction(token: string, input: unknown) {
  return runAction(async () => {
    await enforceRateLimit("qrEntry", `kiosk:${token}`);
    const order = await placeKioskOrder(db, token, input);
    return { orderId: order.id, number: order.number };
  });
}
