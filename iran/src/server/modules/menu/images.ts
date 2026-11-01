import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { Database, DbOrTx } from "@/server/db/client";
import { productImages, products } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { AppError, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid, randomToken } from "@/lib/ids";
import { PRODUCT_VARIANTS, processImage } from "@/server/infra/images";
import { newAssetBase, storage, variantKey } from "@/server/infra/storage";
import { MAX_PRODUCT_IMAGES } from "./schemas";

export type ImageUrls = { sm: string; md: string; lg: string };

export function productImageUrls(storageKey: string): ImageUrls {
  const s = storage();
  return {
    sm: s.publicUrl(variantKey(storageKey, "sm", "image/webp")),
    md: s.publicUrl(variantKey(storageKey, "md", "image/webp")),
    lg: s.publicUrl(variantKey(storageKey, "lg", "image/webp")),
  };
}

function variantKeys(storageKey: string) {
  return PRODUCT_VARIANTS.map((v) => variantKey(storageKey, v.suffix, "image/webp"));
}

async function loadLiveProduct(tx: DbOrTx, ctx: RestaurantContext, productId: string) {
  if (!isUuid(productId)) throw notFound();
  const [p] = await tx
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.id, productId),
        eq(products.restaurantId, ctx.restaurant.id),
        isNull(products.deletedAt),
      ),
    );
  if (!p) throw notFound();
  return p;
}

export async function listProductImages(db: DbOrTx, productId: string) {
  const rows = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.sortOrder), asc(productImages.createdAt));
  return rows.map((r) => ({ ...r, urls: productImageUrls(r.storageKey) }));
}

/** Validates, re-encodes into responsive WebP variants, stores, then records the image. */
export async function addProductImage(db: Database, ctx: RestaurantContext, productId: string, file: Buffer) {
  assertCan(ctx, "menu.manage");
  await loadLiveProduct(db, ctx, productId);
  const [c] = await db
    .select({ n: count() })
    .from(productImages)
    .where(eq(productImages.productId, productId));
  if ((c?.n ?? 0) >= MAX_PRODUCT_IMAGES) throw new AppError("CONFLICT", "too_many_images");

  // Heavy work outside the transaction.
  const image = await processImage(file, PRODUCT_VARIANTS);
  const base = newAssetBase(ctx.restaurant.id, "product", randomToken(16));
  await Promise.all(
    image.variants.map((v) =>
      storage().put(variantKey(base, v.suffix, v.contentType), v.body, v.contentType),
    ),
  );

  try {
    return await db.transaction(async (tx) => {
      await loadLiveProduct(tx, ctx, productId);
      const [n] = await tx
        .select({ n: count() })
        .from(productImages)
        .where(eq(productImages.productId, productId));
      if ((n?.n ?? 0) >= MAX_PRODUCT_IMAGES) throw new AppError("CONFLICT", "too_many_images");
      const [row] = await tx
        .insert(productImages)
        .values({
          restaurantId: ctx.restaurant.id,
          productId,
          storageKey: base,
          width: image.width,
          height: image.height,
          placeholder: image.placeholder,
          sortOrder: n?.n ?? 0,
        })
        .returning();
      await recordAudit(tx, {
        action: "product.image_added",
        actorUserId: ctx.user.id,
        restaurantId: ctx.restaurant.id,
        entityType: "product",
        entityId: productId,
      });
      return { ...row!, urls: productImageUrls(base) };
    });
  } catch (e) {
    // Don't leave orphan files behind.
    await storage()
      .delete(variantKeys(base))
      .catch(() => {});
    throw e;
  }
}

async function loadImage(tx: DbOrTx, ctx: RestaurantContext, imageId: string) {
  if (!isUuid(imageId)) throw notFound();
  const [img] = await tx
    .select()
    .from(productImages)
    .where(and(eq(productImages.id, imageId), eq(productImages.restaurantId, ctx.restaurant.id)));
  if (!img) throw notFound();
  return img;
}

export async function deleteProductImage(db: Database, ctx: RestaurantContext, imageId: string) {
  assertCan(ctx, "menu.manage");
  const img = await db.transaction(async (tx) => {
    const img = await loadImage(tx, ctx, imageId);
    await tx.delete(productImages).where(eq(productImages.id, imageId));
    const rest = await tx
      .select({ id: productImages.id })
      .from(productImages)
      .where(eq(productImages.productId, img.productId))
      .orderBy(asc(productImages.sortOrder));
    for (const [i, r] of rest.entries()) {
      await tx.update(productImages).set({ sortOrder: i }).where(eq(productImages.id, r.id));
    }
    // Branches that copied a menu share the stored files: keep them while still referenced.
    const [shared] = await tx
      .select({ id: productImages.id })
      .from(productImages)
      .where(eq(productImages.storageKey, img.storageKey))
      .limit(1);
    return { ...img, shared: Boolean(shared) };
  });
  if (img.shared) return;
  await storage()
    .delete(variantKeys(img.storageKey))
    .catch((e) => console.error("[storage] failed to delete product image", e));
}

/** Moves an image to the first position (it becomes the main photo on the menu). */
export async function setPrimaryImage(db: Database, ctx: RestaurantContext, imageId: string) {
  assertCan(ctx, "menu.manage");
  await db.transaction(async (tx) => {
    const img = await loadImage(tx, ctx, imageId);
    const all = await tx
      .select({ id: productImages.id })
      .from(productImages)
      .where(eq(productImages.productId, img.productId))
      .orderBy(asc(productImages.sortOrder));
    const ordered = [img.id, ...all.map((a) => a.id).filter((id) => id !== img.id)];
    for (const [i, id] of ordered.entries()) {
      await tx.update(productImages).set({ sortOrder: i }).where(eq(productImages.id, id));
    }
  });
}
