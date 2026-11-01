"use server";

import { refresh, updateTag } from "next/cache";
import { actionContext, runAction } from "@/server/actions";
import { db } from "@/server/db/client";
import { menuTag } from "@/server/modules/menu/cache";
import { recalculateMenu } from "@/server/modules/nutrition/foods";

export async function recalculateMenuAction(restaurantId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "menu.manage");
    const res = await recalculateMenu(db, ctx.restaurant.id);
    updateTag(menuTag(ctx.restaurant.id));
    refresh();
    return res;
  });
}
