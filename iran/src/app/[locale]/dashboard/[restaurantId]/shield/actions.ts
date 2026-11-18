"use server";

import { refresh } from "next/cache";
import type { z } from "zod";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { applyRialShield, saveShield, type shieldSchema } from "@/server/modules/pms/shield";

export async function saveShieldAction(rid: string, input: z.input<typeof shieldSchema>) {
  return runAction(async () => {
    const res = await saveShield(db, await actionContext(rid, "restaurant.manage"), input);
    refresh();
    return res;
  });
}

export async function applyShieldAction(rid: string) {
  return runAction(async () => {
    const res = await applyRialShield(db, await actionContext(rid, "restaurant.manage"), { force: true });
    refresh();
    return res;
  });
}
