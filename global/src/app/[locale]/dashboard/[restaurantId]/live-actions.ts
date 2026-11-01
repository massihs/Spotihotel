"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { closeTableSession } from "@/server/modules/floor/service";
import { listNotifications, markNotificationsRead } from "@/server/modules/notifications/service";

export async function listNotificationsAction(restaurantId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.view");
    const { items, unread } = await listNotifications(db, ctx, 20);
    return {
      unread,
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        payload: n.payload,
        createdAt: n.createdAt.toISOString(),
        read: !!n.readAt,
      })),
    };
  });
}

export async function markNotificationsReadAction(restaurantId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.view");
    await markNotificationsRead(db, ctx);
  });
}

export async function closeTableAction(restaurantId: string, tableId: string, force: boolean) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "sessions.close");
    await closeTableSession(db, ctx, tableId, { force });
    refresh();
  });
}
