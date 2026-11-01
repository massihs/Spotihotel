import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { productImages, products, restaurantSettings, restaurants, reviews } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { CUISINES, cityOf, distanceKm, type City, type Cuisine, isCuisine } from "@/lib/directory";
import { openState, type OpenState } from "@/lib/opening";
import type { OpeningHours } from "@/server/db/schema/restaurant";
import { productImageUrls } from "@/server/modules/menu/images";
import { COVER_VARIANTS, processImage } from "@/server/infra/images";
import { newAssetBase, storage, variantKey } from "@/server/infra/storage";
import { randomToken } from "@/lib/ids";
import { notFound } from "@/server/errors";
import { logoUrl } from "@/server/modules/restaurants/settings";

export const DIRECTORY_TAG = "directory";

export type DirectoryEntry = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  brandColor: string;
  logo: string | null;
  cover: { md: string; lg: string } | null;
  tagline: string | null;
  cuisines: Cuisine[];
  priceLevel: number | null;
  /** Dish prices shown on the public page. */
  showPrices: boolean;
  city: City | null;
  cityText: string | null;
  address: string | null;
  phone: string | null;
  /** The restaurant's own position, else its city centre (`approximate`). */
  position: { lat: number; lng: number; approximate: boolean } | null;
  rating: number | null;
  reviewCount: number;
  reservable: boolean;
  openingHours: OpeningHours | null;
  timezone: string;
  currency: string;
};

/** Every listed, active restaurant with what its directory card shows. */
export async function loadDirectory(db: DbOrTx): Promise<DirectoryEntry[]> {
  const rows = await db
    .select({
      id: restaurants.id,
      slug: restaurants.slug,
      name: restaurants.name,
      kind: restaurants.kind,
      brandColor: restaurants.brandColor,
      logoKey: restaurants.logoKey,
      tagline: restaurants.tagline,
      coverKey: restaurants.coverKey,
      cuisines: restaurants.cuisines,
      priceLevel: restaurants.priceLevel,
      showPrices: restaurants.showPublicPrices,
      city: restaurants.city,
      line1: restaurants.addressLine1,
      phone: restaurants.phone,
      lat: restaurants.latitude,
      lng: restaurants.longitude,
      timezone: restaurants.timezone,
      currency: restaurants.currency,
      hours: restaurantSettings.openingHours,
      bookings: restaurantSettings.reservationsEnabled,
      disabled: restaurantSettings.disabledModules,
    })
    .from(restaurants)
    .innerJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .where(and(eq(restaurants.listed, true), eq(restaurants.status, "active"), isNull(restaurants.deletedAt)))
    .orderBy(asc(restaurants.name));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [ratings, covers] = await Promise.all([
    db
      .select({
        id: reviews.restaurantId,
        avg: sql<number>`avg(${reviews.rating})::float`,
        n: sql<number>`count(*)::int`,
      })
      .from(reviews)
      .where(and(inArray(reviews.restaurantId, ids), eq(reviews.isPublished, true)))
      .groupBy(reviews.restaurantId),
    // One photo per restaurant: a featured dish first.
    db
      .selectDistinctOn([productImages.restaurantId], {
        id: productImages.restaurantId,
        key: productImages.storageKey,
      })
      .from(productImages)
      .innerJoin(products, eq(products.id, productImages.productId))
      .where(
        and(
          inArray(productImages.restaurantId, ids),
          eq(products.isActive, true),
          isNull(products.deletedAt),
        ),
      )
      .orderBy(
        productImages.restaurantId,
        desc(products.isFeatured),
        asc(products.sortOrder),
        asc(productImages.sortOrder),
      ),
  ]);
  const ratingOf = new Map(ratings.map((r) => [r.id, r]));
  const coverOf = new Map<string, { md: string; lg: string }>(
    covers.map((c) => [c.id, productImageUrls(c.key)]),
  );
  // The owner's choice wins, as long as a chosen dish photo still exists.
  const chosen = await liveCoverKeys(
    db,
    rows.map((r) => r.coverKey),
  );
  for (const r of rows) if (r.coverKey && chosen.has(r.coverKey)) coverOf.set(r.id, coverUrls(r.coverKey));

  return rows.map((r) => {
    const city = cityOf(r.city);
    const own = r.lat != null && r.lng != null;
    const rating = ratingOf.get(r.id);
    const cover = coverOf.get(r.id);
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      kind: r.kind,
      brandColor: r.brandColor,
      logo: logoUrl(r.logoKey),
      cover: cover ? { md: cover.md, lg: cover.lg } : null,
      tagline: r.tagline,
      cuisines: r.cuisines.filter(isCuisine),
      priceLevel: r.priceLevel,
      showPrices: r.showPrices,
      city,
      cityText: r.city,
      address: [r.line1, r.city].filter(Boolean).join("، ") || null,
      phone: r.phone,
      position: own
        ? { lat: r.lat!, lng: r.lng!, approximate: false }
        : city
          ? { lat: city.lat, lng: city.lng, approximate: true }
          : null,
      rating: rating ? Math.round(rating.avg * 10) / 10 : null,
      reviewCount: rating?.n ?? 0,
      reservable: r.bookings && !r.disabled.includes("reservations"),
      openingHours: r.hours,
      timezone: r.timezone,
      currency: r.currency,
    };
  });
}

export type DirectoryQuery = {
  city?: string | null;
  cuisine?: string | null;
  q?: string | null;
  near?: { lat: number; lng: number } | null;
  radiusKm?: number | null;
  openNow?: boolean;
  reservable?: boolean;
};

export type DirectoryResult = DirectoryEntry & { open: OpenState; distanceKm: number | null };

/** Filters and orders the directory: nearest first around a position, else best rated. */
export function searchDirectory(
  all: DirectoryEntry[],
  query: DirectoryQuery,
  at = new Date(),
): DirectoryResult[] {
  const q = query.q?.trim().toLowerCase();
  const out: DirectoryResult[] = [];
  for (const e of all) {
    if (query.city && e.city?.key !== query.city) continue;
    if (query.cuisine && !e.cuisines.includes(query.cuisine as Cuisine)) continue;
    if (query.reservable && !e.reservable) continue;
    if (q && ![e.name, e.tagline, e.cityText].some((s) => s?.toLowerCase().includes(q))) continue;
    const distance = query.near && e.position ? distanceKm(query.near, e.position) : null;
    if (query.near && query.radiusKm && (distance == null || distance > query.radiusKm)) continue;
    const open = openState(e.openingHours, e.timezone, at);
    if (query.openNow && open.status !== "open") continue;
    out.push({ ...e, open, distanceKm: distance });
  }
  return out.sort((a, b) =>
    query.near
      ? (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
      : (b.rating ?? 0) - (a.rating ?? 0) || b.reviewCount - a.reviewCount || a.name.localeCompare(b.name),
  );
}

/** Listed restaurants per city and per theme, for the filter chips. */
export function directoryFacets(all: DirectoryEntry[]) {
  const cities = new Map<string, number>();
  const cuisines = new Map<string, number>();
  for (const e of all) {
    if (e.city) cities.set(e.city.key, (cities.get(e.city.key) ?? 0) + 1);
    for (const c of e.cuisines) cuisines.set(c, (cuisines.get(c) ?? 0) + 1);
  }
  return { cities, cuisines };
}

// ─── Owner side ──────────────────────────────────────────────────────────────

const coord = (min: number, max: number) =>
  z
    .union([z.number(), z.string()])
    .transform((v) => (v === "" ? null : Number(v)))
    .pipe(z.number().min(min).max(max).nullable());

export const listingSchema = z
  .object({
    listed: z.boolean(),
    cuisines: z.array(z.enum(CUISINES)).max(5),
    priceLevel: z.number().int().min(1).max(4).nullable(),
    showPublicPrices: z.boolean().default(true),
    tagline: z
      .string()
      .trim()
      .max(200)
      .transform((v) => v || null)
      .nullable(),
    city: z
      .string()
      .trim()
      .max(100)
      .transform((v) => v || null)
      .nullable(),
    latitude: coord(-90, 90),
    longitude: coord(-180, 180),
  })
  .refine((v) => (v.latitude == null) === (v.longitude == null), {
    message: "invalid_position",
    path: ["latitude"],
  });
export type ListingInput = z.input<typeof listingSchema>;

export async function getListing(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  const [r] = await db
    .select({
      listed: restaurants.listed,
      cuisines: restaurants.cuisines,
      priceLevel: restaurants.priceLevel,
      showPublicPrices: restaurants.showPublicPrices,
      tagline: restaurants.tagline,
      city: restaurants.city,
      latitude: restaurants.latitude,
      longitude: restaurants.longitude,
      slug: restaurants.slug,
    })
    .from(restaurants)
    .where(eq(restaurants.id, ctx.restaurant.id));
  return { ...r!, cityKey: cityOf(r!.city)?.key ?? null };
}

export async function updateListing(db: Database, ctx: RestaurantContext, raw: ListingInput) {
  assertCan(ctx, "restaurant.manage");
  const input = listingSchema.parse(raw);
  await db.transaction(async (tx) => {
    await tx.update(restaurants).set(input).where(eq(restaurants.id, ctx.restaurant.id));
    await recordAudit(tx, {
      action: "restaurant.listing_updated",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      metadata: { listed: input.listed },
    });
  });
}

// ─── Guide photo ─────────────────────────────────────────────────────────────

const isUploadedCover = (key: string) => key.split("/")[2] === "cover";

function coverUrls(key: string) {
  const s = storage();
  return {
    md: s.publicUrl(variantKey(key, "md", "image/webp")),
    lg: s.publicUrl(variantKey(key, "lg", "image/webp")),
  };
}

/** Chosen keys still backed by files: uploaded covers, or dish photos not deleted since. */
async function liveCoverKeys(db: DbOrTx, keys: (string | null)[]) {
  const wanted = keys.filter((k): k is string => Boolean(k));
  const live = new Set(wanted.filter(isUploadedCover));
  const dish = wanted.filter((k) => !isUploadedCover(k));
  if (dish.length) {
    const rows = await db
      .select({ key: productImages.storageKey })
      .from(productImages)
      .where(inArray(productImages.storageKey, dish));
    for (const r of rows) live.add(r.key);
  }
  return live;
}

/** The guide photo as the owner sees it in settings, and the dish photos it can be picked from. */
export async function getCoverChoices(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  const [r] = await db
    .select({ coverKey: restaurants.coverKey })
    .from(restaurants)
    .where(eq(restaurants.id, ctx.restaurant.id));
  const photos = await db
    .select({ id: productImages.id, key: productImages.storageKey, name: products.name })
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(
      and(
        eq(productImages.restaurantId, ctx.restaurant.id),
        eq(products.isActive, true),
        isNull(products.deletedAt),
      ),
    )
    .orderBy(desc(products.isFeatured), asc(products.sortOrder), asc(productImages.sortOrder))
    .limit(48);
  const key = r?.coverKey && (await liveCoverKeys(db, [r.coverKey])).has(r.coverKey) ? r.coverKey : null;
  return {
    mode: !key ? ("auto" as const) : isUploadedCover(key) ? ("upload" as const) : ("dish" as const),
    current: key ? coverUrls(key).md : photos[0] ? productImageUrls(photos[0].key).md : null,
    selectedKey: key,
    photos: photos.map((p) => ({ id: p.id, key: p.key, name: p.name, url: productImageUrls(p.key).sm })),
  };
}

async function setCover(db: Database, ctx: RestaurantContext, key: string | null) {
  const [prev] = await db
    .select({ coverKey: restaurants.coverKey })
    .from(restaurants)
    .where(eq(restaurants.id, ctx.restaurant.id));
  await db.transaction(async (tx) => {
    await tx.update(restaurants).set({ coverKey: key }).where(eq(restaurants.id, ctx.restaurant.id));
    await recordAudit(tx, {
      action: "restaurant.cover_updated",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      metadata: { mode: !key ? "auto" : isUploadedCover(key) ? "upload" : "dish" },
    });
  });
  // An uploaded cover belongs to the restaurant alone: its files go once it is replaced.
  if (prev?.coverKey && prev.coverKey !== key && isUploadedCover(prev.coverKey))
    await storage()
      .delete(COVER_VARIANTS.map((v) => variantKey(prev.coverKey!, v.suffix, "image/webp")))
      .catch((e) => console.error("[storage] failed to delete old cover", e));
}

export async function uploadCover(db: Database, ctx: RestaurantContext, file: Buffer) {
  assertCan(ctx, "restaurant.manage");
  const image = await processImage(file, COVER_VARIANTS);
  const base = newAssetBase(ctx.restaurant.id, "cover", randomToken(16));
  const store = storage();
  await Promise.all(
    image.variants.map((v) => store.put(variantKey(base, v.suffix, v.contentType), v.body, v.contentType)),
  );
  await setCover(db, ctx, base);
  return coverUrls(base);
}

export async function chooseDishCover(db: Database, ctx: RestaurantContext, imageId: string) {
  assertCan(ctx, "restaurant.manage");
  const [img] = await db
    .select({ key: productImages.storageKey })
    .from(productImages)
    .where(and(eq(productImages.id, imageId), eq(productImages.restaurantId, ctx.restaurant.id)));
  if (!img) throw notFound();
  await setCover(db, ctx, img.key);
}

export async function resetCover(db: Database, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.manage");
  await setCover(db, ctx, null);
}
