import { and, asc, count, eq, isNull, ne } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { orders, products, restaurantSettings, restaurants, taxRates } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { AppError, conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { randomToken } from "@/lib/ids";
import { LOGO_VARIANTS, processImage } from "@/server/infra/images";
import { newAssetBase, storage, variantKey } from "@/server/infra/storage";
import {
  legalSchema,
  profileSchema,
  serviceSettingsSchema,
  taxRateSchema,
  type LegalInput,
  type ProfileInput,
  type ServiceSettingsInput,
  type TaxRateInput,
} from "./schemas";

export function logoUrl(logoKey: string | null | undefined, size: "256" | "512" = "256") {
  if (!logoKey) return null;
  return storage().publicUrl(`${logoKey}-${size}.${size === "512" ? "png" : "webp"}`);
}

export async function getRestaurantSettingsView(db: Database, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  const [row] = await db
    .select({ restaurant: restaurants, settings: restaurantSettings })
    .from(restaurants)
    .innerJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .where(eq(restaurants.id, ctx.restaurant.id));
  if (!row) throw notFound();
  const rates = await listTaxRates(db, ctx);
  return { ...row, taxRates: rates, logoUrl: logoUrl(row.restaurant.logoKey) };
}

export async function updateProfile(db: Database, ctx: RestaurantContext, raw: ProfileInput) {
  assertCan(ctx, "restaurant.manage");
  const input = profileSchema.parse(raw);
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    if (input.currency !== ctx.restaurant.currency) {
      // Changing currency would corrupt historical amounts.
      const [o] = await tx.select({ n: count() }).from(orders).where(eq(orders.restaurantId, rid));
      if ((o?.n ?? 0) > 0) throw new AppError("CONFLICT", "currency_locked", { field: "currency" });
    }
    const [updated] = await tx.update(restaurants).set(input).where(eq(restaurants.id, rid)).returning();
    await recordAudit(tx, {
      action: "restaurant.profile_updated",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "restaurant",
      entityId: rid,
      metadata: { fields: Object.keys(input) },
    });
    return updated!;
  });
}

export async function updateServiceSettings(db: Database, ctx: RestaurantContext, raw: ServiceSettingsInput) {
  assertCan(ctx, "restaurant.manage");
  const input = serviceSettingsSchema.parse(raw);
  const [r] = await db
    .select({ defaultLocale: restaurants.defaultLocale })
    .from(restaurants)
    .where(eq(restaurants.id, ctx.restaurant.id));
  const locales = Array.from(new Set([...(input.enabledLocales as string[]), r!.defaultLocale]));
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(restaurantSettings)
      .set({ ...input, enabledLocales: locales })
      .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id))
      .returning();
    await recordAudit(tx, {
      action: "restaurant.settings_updated",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
    });
    return updated!;
  });
}

export async function updateLegal(db: Database, ctx: RestaurantContext, raw: LegalInput) {
  assertCan(ctx, "restaurant.manage");
  const input = legalSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(restaurantSettings)
      .set(input)
      .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id))
      .returning();
    await recordAudit(tx, {
      action: "restaurant.legal_updated",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
    });
    return updated!;
  });
}

export async function uploadLogo(db: Database, ctx: RestaurantContext, file: Buffer) {
  assertCan(ctx, "restaurant.manage");
  const image = await processImage(file, LOGO_VARIANTS);
  const base = newAssetBase(ctx.restaurant.id, "logo", randomToken(16));
  const store = storage();
  const keys = image.variants.map((v) => variantKey(base, v.suffix, v.contentType));
  await Promise.all(image.variants.map((v, i) => store.put(keys[i]!, v.body, v.contentType)));

  const [prev] = await db
    .select({ logoKey: restaurants.logoKey })
    .from(restaurants)
    .where(eq(restaurants.id, ctx.restaurant.id));
  await db.transaction(async (tx) => {
    await tx.update(restaurants).set({ logoKey: base }).where(eq(restaurants.id, ctx.restaurant.id));
    await recordAudit(tx, {
      action: "restaurant.logo_updated",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
    });
  });
  if (prev?.logoKey) await deleteLogoFiles(prev.logoKey);
  return { logoKey: base, url: logoUrl(base) };
}

export async function removeLogo(db: Database, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.manage");
  const [prev] = await db
    .select({ logoKey: restaurants.logoKey })
    .from(restaurants)
    .where(eq(restaurants.id, ctx.restaurant.id));
  if (!prev?.logoKey) return;
  await db.update(restaurants).set({ logoKey: null }).where(eq(restaurants.id, ctx.restaurant.id));
  await deleteLogoFiles(prev.logoKey);
}

async function deleteLogoFiles(base: string) {
  await storage()
    .delete(
      LOGO_VARIANTS.map((v) => variantKey(base, v.suffix, v.format === "png" ? "image/png" : "image/webp")),
    )
    .catch((e) => console.error("[storage] failed to delete old logo", e));
}

// ─── Tax rates ────────────────────────────────────────────────────────────────

export async function listTaxRates(db: Database, ctx: RestaurantContext) {
  return db
    .select()
    .from(taxRates)
    .where(and(eq(taxRates.restaurantId, ctx.restaurant.id), isNull(taxRates.deletedAt)))
    .orderBy(asc(taxRates.rateBps));
}

export async function createTaxRate(db: Database, ctx: RestaurantContext, raw: TaxRateInput) {
  assertCan(ctx, "restaurant.manage");
  const input = taxRateSchema.parse(raw);
  const [row] = await db
    .insert(taxRates)
    .values({ ...input, restaurantId: ctx.restaurant.id })
    .returning();
  await recordAudit(db, {
    action: "tax_rate.created",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "tax_rate",
    entityId: row!.id,
    metadata: input,
  });
  return row!;
}

export async function updateTaxRate(db: Database, ctx: RestaurantContext, id: string, raw: TaxRateInput) {
  assertCan(ctx, "restaurant.manage");
  const input = taxRateSchema.parse(raw);
  const [row] = await db
    .update(taxRates)
    .set(input)
    .where(and(eq(taxRates.id, id), eq(taxRates.restaurantId, ctx.restaurant.id), isNull(taxRates.deletedAt)))
    .returning();
  if (!row) throw notFound();
  await recordAudit(db, {
    action: "tax_rate.updated",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "tax_rate",
    entityId: id,
    metadata: input,
  });
  return row;
}

export async function setDefaultTaxRate(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "restaurant.manage");
  await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: taxRates.id })
      .from(taxRates)
      .where(
        and(eq(taxRates.id, id), eq(taxRates.restaurantId, ctx.restaurant.id), isNull(taxRates.deletedAt)),
      );
    if (!target) throw notFound();
    await tx
      .update(taxRates)
      .set({ isDefault: false })
      .where(and(eq(taxRates.restaurantId, ctx.restaurant.id), ne(taxRates.id, id)));
    await tx.update(taxRates).set({ isDefault: true }).where(eq(taxRates.id, id));
  });
}

export async function deleteTaxRate(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "restaurant.manage");
  await db.transaction(async (tx) => {
    const [rate] = await tx
      .select()
      .from(taxRates)
      .where(
        and(eq(taxRates.id, id), eq(taxRates.restaurantId, ctx.restaurant.id), isNull(taxRates.deletedAt)),
      );
    if (!rate) throw notFound();
    if (rate.isDefault) throw conflict("tax_rate_default");
    const [used] = await tx
      .select({ n: count() })
      .from(products)
      .where(and(eq(products.taxRateId, id), isNull(products.deletedAt)));
    if ((used?.n ?? 0) > 0) throw conflict("tax_rate_in_use");
    await tx.update(taxRates).set({ deletedAt: new Date() }).where(eq(taxRates.id, id));
    await recordAudit(tx, {
      action: "tax_rate.deleted",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "tax_rate",
      entityId: id,
    });
  });
}
