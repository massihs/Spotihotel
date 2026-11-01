"use server";

import { db } from "@/server/db/client";
import { runAction } from "@/server/actions";
import { enforceRateLimit } from "@/server/infra/rate-limit";
import { spinWheel, submitFeedback } from "@/server/modules/feedback/service";

export async function submitFeedbackAction(token: string, rating: number, comment: string) {
  return runAction(async () => {
    await enforceRateLimit("qrEntry", `feedback:${token}`);
    return submitFeedback(db, token, { rating, comment });
  });
}

export async function spinWheelAction(token: string) {
  return runAction(async () => {
    await enforceRateLimit("qrEntry", `wheel:${token}`);
    return spinWheel(db, token);
  });
}
