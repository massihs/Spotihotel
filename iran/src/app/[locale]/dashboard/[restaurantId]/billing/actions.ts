"use server";

import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { startCheckout } from "@/server/modules/billing/service";

/** Returns the Zarinpal page the owner is sent to. */
export async function startCheckoutAction(restaurantId: string, planCode: string, months: number) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    const res = await startCheckout(db, ctx, { planCode, months });
    return { redirectUrl: res.redirectUrl };
  });
}
