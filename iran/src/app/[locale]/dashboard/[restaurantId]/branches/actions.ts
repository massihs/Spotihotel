"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { copyMenuFrom, createBranch } from "@/server/modules/branches/service";

export async function createBranchAction(
  rid: string,
  input: { name: string; copyMenu: boolean; copySettings: boolean },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.view");
    const b = await createBranch(db, ctx, input);
    refresh();
    return { id: b.id };
  });
}

export async function copyMenuAction(rid: string, fromId: string, mode: "append" | "replace") {
  return runAction(async () => {
    const ctx = await actionContext(rid, "menu.manage");
    const source = await actionContext(fromId, "menu.view");
    const res = await copyMenuFrom(db, ctx, source, { fromId, mode });
    refresh();
    return res;
  });
}
