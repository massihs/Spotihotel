"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { deleteStation, saveStation, type STATION_COLORS } from "@/server/modules/kitchen/stations";

export async function saveStationAction(
  rid: string,
  id: string | null,
  input: { name: string; color: (typeof STATION_COLORS)[number]; categoryIds: string[] },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "menu.manage");
    await saveStation(db, ctx, id, input);
    refresh();
  });
}

export async function deleteStationAction(rid: string, id: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "menu.manage");
    await deleteStation(db, ctx, id);
    refresh();
  });
}
