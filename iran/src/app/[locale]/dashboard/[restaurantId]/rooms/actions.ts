"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { checkOutRoom, setHousekeeping } from "@/server/modules/hotel/rooms";

export async function setHousekeepingAction(restaurantId: string, tableId: string, status: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "orders.update_status");
    await setHousekeeping(db, ctx, tableId, status);
    refresh();
  });
}

export async function checkOutRoomAction(restaurantId: string, tableId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "sessions.close");
    await checkOutRoom(db, ctx, tableId);
    refresh();
  });
}
