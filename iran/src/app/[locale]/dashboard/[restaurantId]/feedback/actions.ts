"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { updateFeedbackSettings } from "@/server/modules/feedback/service";

export async function updateFeedbackSettingsAction(restaurantId: string, input: unknown) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    await updateFeedbackSettings(db, ctx, input);
    refresh();
  });
}
