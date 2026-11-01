"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import {
  adjustPoints,
  createCoupon,
  createCustomer,
  deleteCoupon,
  sendCampaign,
  setCouponActive,
  updateCustomer,
  updateLoyaltySettings,
  repayAccount,
  setCreditLimit,
  type Audience,
} from "@/server/modules/customers/service";

export async function createCustomerAction(
  rid: string,
  input: { phone: string; name: string; note: string },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "customers.manage");
    const c = await createCustomer(db, ctx, input);
    refresh();
    return { id: c.id };
  });
}

export async function updateCustomerAction(
  rid: string,
  id: string,
  input: { name: string; note: string; smsOptOut: boolean },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "customers.manage");
    await updateCustomer(db, ctx, id, input);
    refresh();
  });
}

export async function adjustPointsAction(rid: string, id: string, delta: number) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "customers.manage");
    await adjustPoints(db, ctx, id, delta);
    refresh();
  });
}

export async function createCouponAction(
  rid: string,
  input: {
    code: string;
    kind: "percent" | "amount";
    value: number;
    minOrderCents: number;
    maxUses: number | null;
    endsAt: string | null;
  },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "customers.manage");
    await createCoupon(db, ctx, input);
    refresh();
  });
}

export async function setCouponActiveAction(rid: string, id: string, active: boolean) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "customers.manage");
    await setCouponActive(db, ctx, id, active);
    refresh();
  });
}

export async function deleteCouponAction(rid: string, id: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "customers.manage");
    await deleteCoupon(db, ctx, id);
    refresh();
  });
}

export async function sendCampaignAction(rid: string, input: { message: string; audience: Audience }) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "customers.manage");
    const res = await sendCampaign(db, ctx, input);
    refresh();
    return res;
  });
}

export async function updateLoyaltyAction(
  rid: string,
  input: { enabled: boolean; spendPerPointCents: number; pointValueCents: number },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "customers.manage");
    await updateLoyaltySettings(db, ctx, input);
    refresh();
  });
}

export async function setCreditLimitAction(rid: string, id: string, limitCents: number | null) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "customers.manage");
    await setCreditLimit(db, ctx, id, limitCents);
    refresh();
  });
}

export async function repayAccountAction(
  rid: string,
  id: string,
  input: { amountCents: number; method: "cash" | "card" | "transfer"; note: string },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "payments.record");
    const res = await repayAccount(db, ctx, id, input);
    refresh();
    return res;
  });
}
