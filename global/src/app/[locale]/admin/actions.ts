"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db/client";
import { requestMeta, requireSuperAdmin } from "@/server/auth/current";
import { recordAudit } from "@/server/audit";
import { setRestaurantStatus } from "@/server/modules/restaurants/service";

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
