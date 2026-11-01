"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import {
  createCourier,
  deleteCourier,
  deleteZone,
  dispatchOrder,
  markDelivered,
  saveZone,
  setCourierActive,
  settleCourier,
} from "@/server/modules/delivery/service";

export async function dispatchAction(rid: string, orderId: string, courierId: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "orders.update_status");
    await dispatchOrder(db, ctx, orderId, courierId);
    refresh();
  });
}

export async function deliveredAction(rid: string, orderId: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "orders.update_status");
    await markDelivered(db, ctx, orderId);
    refresh();
  });
}

export async function settleCourierAction(rid: string, courierId: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "payments.record");
    const res = await settleCourier(db, ctx, courierId);
    refresh();
    return res;
  });
}

export async function saveZoneAction(
  rid: string,
  id: string | null,
  input: { name: string; feeCents: number; minOrderCents: number; etaMinutes: number; isActive: boolean },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.manage");
    await saveZone(db, ctx, id, input);
    refresh();
  });
}

export async function deleteZoneAction(rid: string, id: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.manage");
    await deleteZone(db, ctx, id);
    refresh();
  });
}

export async function createCourierAction(rid: string, input: { name: string; phone: string }) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.manage");
    await createCourier(db, ctx, input);
    refresh();
  });
}

export async function setCourierActiveAction(rid: string, id: string, active: boolean) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.manage");
    await setCourierActive(db, ctx, id, active);
    refresh();
  });
}

export async function deleteCourierAction(rid: string, id: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.manage");
    await deleteCourier(db, ctx, id);
    refresh();
  });
}
