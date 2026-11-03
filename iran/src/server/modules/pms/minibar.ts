import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { minibarItems, stays } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { emit, topics } from "@/server/infra/realtime";
import { conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { mainFolioOf, postLine } from "./folios";
import { getPmsSettings } from "./setup";

export const minibarItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  priceCents: z.coerce.number().int().min(1).max(1_000_000_000_000),
  parQty: z.coerce.number().int().min(0).max(99).default(1),
  active: z.coerce.boolean().default(true),
});

export async function listMinibar(db: DbOrTx, restaurantId: string, activeOnly = false) {
  return db
    .select()
    .from(minibarItems)
    .where(
      and(
        eq(minibarItems.restaurantId, restaurantId),
        isNull(minibarItems.deletedAt),
        activeOnly ? eq(minibarItems.active, true) : undefined,
      ),
    )
    .orderBy(asc(minibarItems.sortOrder), asc(minibarItems.name));
}

export async function saveMinibarItem(
  db: Database,
  ctx: RestaurantContext,
  id: string | null,
  raw: z.input<typeof minibarItemSchema>,
) {
  assertCan(ctx, "rates.manage");
  const input = minibarItemSchema.parse(raw);
  if (!id) {
    const [row] = await db
      .insert(minibarItems)
      .values({ ...input, restaurantId: ctx.restaurant.id })
      .returning();
    return row!;
  }
  const [row] = await db
    .update(minibarItems)
    .set(input)
    .where(and(eq(minibarItems.id, id), eq(minibarItems.restaurantId, ctx.restaurant.id)))
    .returning();
  if (!row) throw notFound();
  return row;
}

export async function deleteMinibarItem(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "rates.manage");
  await db
    .update(minibarItems)
    .set({ deletedAt: new Date(), active: false })
    .where(and(eq(minibarItems.id, id), eq(minibarItems.restaurantId, ctx.restaurant.id)));
}

export const consumptionSchema = z
  .array(z.object({ itemId: z.uuid(), quantity: z.coerce.number().int().min(1).max(50) }))
  .min(1)
  .max(50);

/**
 * Minibar consumption charged to a stay's bill (one line per item, VAT at the service rate).
 * Recorded by housekeeping / the desk, or declared by the guest from the room's QR.
 */
async function charge(
  db: Database,
  restaurant: { id: string; timezone: string },
  stayId: string,
  raw: z.input<typeof consumptionSchema>,
  by: { userId: string | null },
) {
  const lines = consumptionSchema.parse(raw);
  const rid = restaurant.id;
  return db.transaction(async (tx) => {
    const [stay] = await tx
      .select()
      .from(stays)
      .where(and(eq(stays.id, stayId), eq(stays.restaurantId, rid)));
    if (!stay) throw notFound();
    if (stay.status !== "in_house") throw conflict("not_in_house");
    const items = await tx
      .select()
      .from(minibarItems)
      .where(
        and(
          eq(minibarItems.restaurantId, rid),
          isNull(minibarItems.deletedAt),
          eq(minibarItems.active, true),
          inArray(
            minibarItems.id,
            lines.map((l) => l.itemId),
          ),
        ),
      );
    const byId = new Map(items.map((i) => [i.id, i]));
    if (lines.some((l) => !byId.has(l.itemId))) throw notFound("item_not_found");
    const settings = await getPmsSettings(tx, rid, restaurant.timezone);
    const folio = await mainFolioOf(tx, rid, stay.id);
    let total = 0;
    for (const l of lines) {
      const item = byId.get(l.itemId)!;
      total += item.priceCents * l.quantity;
      await postLine(tx, rid, restaurant.timezone, {
        folioId: folio.id,
        kind: "charge",
        department: "minibar",
        description: item.name,
        quantity: l.quantity,
        unitCents: item.priceCents,
        amountCents: item.priceCents * l.quantity,
        taxRateBps: settings.serviceTaxBps,
        sourceType: "minibar",
        userId: by.userId,
      });
    }
    await recordAudit(tx, {
      action: "minibar.charged",
      actorUserId: by.userId,
      actorType: by.userId ? undefined : "guest",
      restaurantId: rid,
      entityType: "stay",
      entityId: stay.id,
      metadata: { totalCents: total, items: lines.length },
    });
    await emit(tx, { topic: topics.restaurant(rid), type: "notification.created" });
    return total;
  });
}

export async function chargeMinibar(
  db: Database,
  ctx: RestaurantContext,
  stayId: string,
  raw: z.input<typeof consumptionSchema>,
) {
  assertCan(ctx, "folio.post");
  return charge(db, ctx.restaurant, stayId, raw, { userId: ctx.user.id });
}

export async function declareMinibar(
  db: Database,
  restaurant: { id: string; timezone: string },
  stayId: string,
  raw: z.input<typeof consumptionSchema>,
) {
  const settings = await getPmsSettings(db, restaurant.id, restaurant.timezone);
  if (!settings.minibarSelfService) throw notFound();
  return charge(db, restaurant, stayId, raw, { userId: null });
}
