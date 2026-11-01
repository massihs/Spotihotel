"use server";

import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { setCategoryStation, setProductStation, setupKitchenAndBar } from "@/server/modules/kitchen/stations";

export async function setCategoryStationAction(rid: string, categoryId: string, stationId: string | null) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "menu.manage");
    await setCategoryStation(db, ctx, categoryId, stationId);
    refresh();
  });
}

export async function setProductStationAction(rid: string, productId: string, stationId: string | null) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "menu.manage");
    await setProductStation(db, ctx, productId, stationId);
    refresh();
  });
}

export async function setupKitchenAndBarAction(rid: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "menu.manage");
    // Station names in the restaurant's language (they are printed on the tickets).
    const t = await getTranslations({ locale: ctx.restaurant.defaultLocale, namespace: "routing" });
    const res = await setupKitchenAndBar(db, ctx, { kitchen: t("kitchenName"), bar: t("barName") });
    refresh();
    return { toBar: res.toBar, toKitchen: res.toKitchen };
  });
}
