"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db/client";
import { requestMeta, requireSuperAdmin } from "@/server/auth/current";
import { recordAudit } from "@/server/audit";
import { setRestaurantStatus } from "@/server/modules/restaurants/service";
import { resolveError } from "@/server/modules/ops/errors";
import { adminGrantPlan, adminUpdatePlan, billingCurrency } from "@/server/modules/billing/service";
import { parseMoneyInput } from "@/lib/money";

const statusSchema = z.object({
  restaurantId: z.uuid(),
  status: z.enum(["active", "suspended"]),
});

export async function setRestaurantStatusAction(formData: FormData) {
  const admin = await requireSuperAdmin();
  const input = statusSchema.parse({
    restaurantId: formData.get("restaurantId"),
    status: formData.get("status"),
  });
  const { ip } = await requestMeta();
  const updated = await db.transaction(async (tx) => {
    const row = await setRestaurantStatus(tx, input.restaurantId, input.status);
    if (row) {
      await recordAudit(tx, {
        action: input.status === "suspended" ? "admin.restaurant_suspended" : "admin.restaurant_reactivated",
        actorUserId: admin.id,
        restaurantId: row.id,
        entityType: "restaurant",
        entityId: row.id,
        ip,
      });
    }
    return row;
  });
  if (updated) refresh();
}

export async function resolveErrorAction(formData: FormData) {
  await requireSuperAdmin();
  const id = z.uuid().parse(formData.get("id"));
  await resolveError(db, id);
  refresh();
}

const limitField = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : Number(s);
};

export async function updatePlanAction(formData: FormData) {
  const admin = await requireSuperAdmin();
  const planId = z.uuid().parse(formData.get("planId"));
  const price = parseMoneyInput(String(formData.get("price") ?? "0"), billingCurrency());
  await adminUpdatePlan(db, admin.id, planId, {
    name: formData.get("name"),
    priceMonthlyCents: price ?? 0,
    isPublic: formData.get("isPublic") === "on",
    maxTables: limitField(formData.get("maxTables")),
    maxStaff: limitField(formData.get("maxStaff")),
    maxRestaurants: limitField(formData.get("maxRestaurants")),
    maxOrdersPerMonth: limitField(formData.get("maxOrdersPerMonth")),
  });
  refresh();
}

export async function grantPlanAction(formData: FormData) {
  const admin = await requireSuperAdmin();
  const input = z
    .object({
      restaurantId: z.uuid(),
      planCode: z.string().min(1).max(32),
      months: z.coerce.number().int().min(0).max(36),
    })
    .parse({
      restaurantId: formData.get("restaurantId"),
      planCode: formData.get("planCode"),
      months: formData.get("months"),
    });
  const amount = parseMoneyInput(String(formData.get("amount") ?? "") || "0", billingCurrency()) ?? 0;
  await adminGrantPlan(db, admin.id, { ...input, amountCents: amount });
  refresh();
}
