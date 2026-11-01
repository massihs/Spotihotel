"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { updateKiosk, updateOnlineSettings } from "@/server/modules/online/service";
import { updateKpiGoals } from "@/server/modules/kpi/service";

export async function updateOnlineSettingsAction(restaurantId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    await updateOnlineSettings(db, ctx, input);
    refresh();
  });
}

export async function updateKioskAction(restaurantId: string, enabled: boolean, regenerate = false) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    const res = await updateKiosk(db, ctx, { enabled: enabled === true, regenerate: regenerate === true });
    refresh();
    return res;
  });
}

export async function updateKpiGoalsAction(restaurantId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    await updateKpiGoals(db, ctx, input);
    refresh();
  });
}
