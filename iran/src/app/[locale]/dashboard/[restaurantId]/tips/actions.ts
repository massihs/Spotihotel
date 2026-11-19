"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { payOutTips } from "@/server/modules/pms/tips";

export async function payOutTipsAction(rid: string, staffUserId: string) {
  return runAction(async () => {
    const res = await payOutTips(db, await actionContext(rid, "folio.adjust"), staffUserId);
    refresh();
    return res;
  });
}
