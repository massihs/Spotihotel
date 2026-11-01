"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import {
  blockGuest,
  confirmTableSession,
  setScansNeedStaff,
  unblockGuest,
} from "@/server/modules/guest/safety";

export async function blockGuestAction(
  restaurantId: string,
  target: { orderId?: string; participantId?: string },
  reason?: string,
) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    const res = await blockGuest(
      db,
      ctx,
      target.orderId ? { orderId: target.orderId } : { participantId: target.participantId },
      reason ?? "",
    );
    refresh();
    return res;
  });
}

export async function unblockGuestAction(restaurantId: string, blockId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    await unblockGuest(db, ctx, blockId);
    refresh();
  });
}

export async function confirmTableAction(restaurantId: string, tableId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    await confirmTableSession(db, ctx, tableId);
    refresh();
  });
}

export async function setScansNeedStaffAction(restaurantId: string, on: boolean) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    await setScansNeedStaff(db, ctx, on === true);
    refresh();
  });
}
