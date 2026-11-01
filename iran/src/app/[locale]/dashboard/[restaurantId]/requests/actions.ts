"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { moveRequest, REQUEST_STATUSES, type RequestStatus } from "@/server/modules/hotel/requests";

export async function moveRequestAction(restaurantId: string, id: string, to: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "orders.update_status");
    if (!(REQUEST_STATUSES as readonly string[]).includes(to)) throw new Error("invalid");
    await moveRequest(db, ctx, id, to as RequestStatus);
    refresh();
  });
}
