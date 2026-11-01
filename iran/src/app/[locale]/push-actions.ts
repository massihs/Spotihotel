"use server";

import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { getCurrentDiner } from "@/server/auth/diner";
import { unauthenticated } from "@/server/errors";
import { getGuest } from "@/server/modules/guest/current";
import { removeSubscription, saveSubscription } from "@/server/modules/push/service";

/** Staff: new orders of this restaurant on this browser. */
export async function subscribeStaffPushAction(restaurantId: string, sub: unknown) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    await saveSubscription(db, sub, { userId: ctx.user.id, restaurantId: ctx.restaurant.id });
  });
}

/** Guest at a table (QR) or signed-in guest (online order): "your order is ready". */
export async function subscribeGuestPushAction(sub: unknown) {
  return runAction(async () => {
    const guest = await getGuest();
    if (guest) return saveSubscription(db, sub, { participantId: guest.participant.id });
    const diner = await getCurrentDiner();
    if (diner) return saveSubscription(db, sub, { dinerId: diner.id });
    throw unauthenticated();
  });
}

export async function unsubscribePushAction(endpoint: string) {
  return runAction(async () => {
    if (typeof endpoint === "string" && endpoint.length < 2000) await removeSubscription(db, endpoint);
  });
}
