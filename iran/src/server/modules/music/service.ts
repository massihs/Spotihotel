import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { edition } from "@/config/edition";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  musicNowPlaying,
  musicSubscriptions,
  musicThemes,
  musicTracks,
  restaurants,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import type { SessionUser } from "@/server/auth/sessions";
import { AppError, conflict, notFound } from "@/server/errors";
import { storage } from "@/server/infra/storage";
import { assertCan, assertSuperAdmin, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { nextWeeklyChange, periodKey, playlistFor, radioNow, type MusicPlan } from "./rotation";

export const MUSIC_PLANS = ["weekly", "monthly"] as const;
export const AUDIO_TYPES: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};
export const MAX_TRACK_BYTES = 40 * 1024 * 1024;
const SUBSCRIPTION_DAYS = 30;

const liveTheme = and(isNull(musicThemes.deletedAt), eq(musicThemes.isActive, true));
const liveTrack = and(isNull(musicTracks.deletedAt), eq(musicTracks.isActive, true));

export const trackUrl = (id: string) => `/api/v1/music/tracks/${id}`;
export const coverUrl = (key: string | null | undefined) => (key ? storage().publicUrl(key) : null);

const COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

/** Square 600px webp artwork in public storage; returns its key. */
async function saveCover(body: Uint8Array | Buffer) {
  const { default: sharp } = await import("sharp");
  const out = await sharp(body).rotate().resize(600, 600, { fit: "cover" }).webp({ quality: 82 }).toBuffer();
  const key = `music/covers/${randomBytes(12).toString("hex")}.webp`;
  await storage().put(key, out, "image/webp");
  return key;
}

/** Tags embedded in the audio file: album art (ID3 APIC, MP4 covr, Vorbis picture), title, artist. */
async function readTags(body: Buffer, mime: string) {
  try {
    const { parseBuffer } = await import("music-metadata");
    const meta = await parseBuffer(body, { mimeType: mime }, { skipPostHeaders: true, duration: false });
    const pic = meta.common.picture?.[0];
    return {
      coverKey: pic?.data?.length ? await saveCover(pic.data).catch(() => null) : null,
      title: meta.common.title?.trim().slice(0, 160) || null,
      artist: (meta.common.artist ?? meta.common.albumartist)?.trim().slice(0, 160) || null,
    };
  } catch {
    return { coverKey: null, title: null, artist: null };
  }
}

// ─── Themes (super admin) ────────────────────────────────────────────────────

export const themeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z
    .string()
    .trim()
    .max(500)
    .transform((v) => v || null)
    .nullable()
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#16a34a"),
});

function slugify(name: string) {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${base || "theme"}-${randomBytes(3).toString("hex")}`;
}

export async function listThemesForAdmin(db: Database, user: SessionUser) {
  assertSuperAdmin(user);
  return db
    .select({
      id: musicThemes.id,
      slug: musicThemes.slug,
      name: musicThemes.name,
      description: musicThemes.description,
      color: musicThemes.color,
      isActive: musicThemes.isActive,
      radioEnabled: musicThemes.radioEnabled,
      trackCount:
        sql<number>`(select count(*) from music_tracks t where t.theme_id = "music_themes"."id" and t.deleted_at is null)`.mapWith(
          Number,
        ),
      totalSec:
        sql<number>`(select coalesce(sum(t.duration_sec), 0) from music_tracks t where t.theme_id = "music_themes"."id" and t.deleted_at is null and t.is_active)`.mapWith(
          Number,
        ),
      subscribers:
        sql<number>`(select count(*) from music_subscriptions s where s.theme_id = "music_themes"."id" and s.status = 'active')`.mapWith(
          Number,
        ),
    })
    .from(musicThemes)
    .where(isNull(musicThemes.deletedAt))
    .orderBy(asc(musicThemes.sortOrder), asc(musicThemes.createdAt));
}

export async function createTheme(db: Database, user: SessionUser, raw: z.input<typeof themeSchema>) {
  assertSuperAdmin(user);
  const input = themeSchema.parse(raw);
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(musicThemes)
    .where(isNull(musicThemes.deletedAt));
  const [theme] = await db
    .insert(musicThemes)
    .values({ ...input, slug: slugify(input.name), sortOrder: n })
    .returning();
  await recordAudit(db, {
    action: "music.theme_created",
    actorUserId: user.id,
    entityType: "music_theme",
    entityId: theme!.id,
  });
  return theme!;
}

export async function updateTheme(
  db: Database,
  user: SessionUser,
  id: string,
  patch: Partial<z.input<typeof themeSchema>> & { isActive?: boolean; radioEnabled?: boolean },
) {
  assertSuperAdmin(user);
  if (!isUuid(id)) throw notFound();
  const { isActive, radioEnabled, ...rest } = patch;
  const fields = Object.keys(rest).length ? themeSchema.partial().parse(rest) : {};
  const [theme] = await db
    .update(musicThemes)
    .set({
      ...fields,
      ...(isActive === undefined ? {} : { isActive }),
      ...(radioEnabled === undefined ? {} : { radioEnabled }),
    })
    .where(and(eq(musicThemes.id, id), isNull(musicThemes.deletedAt)))
    .returning();
  if (!theme) throw notFound();
  return theme;
}

/** A theme with active subscribers cannot be deleted (their playlist would vanish). */
export async function deleteTheme(db: Database, user: SessionUser, id: string) {
  assertSuperAdmin(user);
  if (!isUuid(id)) throw notFound();
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(musicSubscriptions)
    .where(
      and(eq(musicSubscriptions.themeId, id), inArray(musicSubscriptions.status, ["active", "pending"])),
    );
  if (n > 0) throw conflict("theme_has_subscribers");
  await db.update(musicThemes).set({ deletedAt: new Date() }).where(eq(musicThemes.id, id));
}

export async function getThemeForAdmin(db: Database, user: SessionUser, id: string) {
  assertSuperAdmin(user);
  if (!isUuid(id)) throw notFound();
  const [theme] = await db
    .select()
    .from(musicThemes)
    .where(and(eq(musicThemes.id, id), isNull(musicThemes.deletedAt)));
  if (!theme) throw notFound();
  const tracks = await db
    .select()
    .from(musicTracks)
    .where(and(eq(musicTracks.themeId, id), isNull(musicTracks.deletedAt)))
    .orderBy(asc(musicTracks.sortOrder), asc(musicTracks.createdAt));
  return { theme, tracks };
}

// ─── Tracks (super admin) ────────────────────────────────────────────────────

export const trackMetaSchema = z.object({
  title: z.string().trim().min(1).max(160),
  /** The title is only the file name: prefer the file's own tags. */
  fromFileName: z.boolean().default(false),
  artist: z
    .string()
    .trim()
    .max(160)
    .transform((v) => v || null)
    .nullable()
    .optional(),
  durationSec: z.coerce
    .number()
    .int()
    .min(1)
    .max(4 * 3600),
});

export async function addTrack(
  db: Database,
  user: SessionUser,
  themeId: string,
  file: { body: Buffer; type: string },
  raw: z.input<typeof trackMetaSchema>,
) {
  assertSuperAdmin(user);
  if (!isUuid(themeId)) throw notFound();
  const meta = trackMetaSchema.parse(raw);
  const ext = AUDIO_TYPES[file.type];
  if (!ext) throw new AppError("VALIDATION", "audio_type");
  if (file.body.length === 0 || file.body.length > MAX_TRACK_BYTES)
    throw new AppError("VALIDATION", "audio_size");
  const [theme] = await db
    .select({ id: musicThemes.id })
    .from(musicThemes)
    .where(and(eq(musicThemes.id, themeId), isNull(musicThemes.deletedAt)));
  if (!theme) throw notFound();

  const key = `music/${themeId}/${randomBytes(12).toString("hex")}.${ext}`;
  const mime = file.type === "audio/mp3" ? "audio/mpeg" : file.type;
  await storage().put(key, file.body, mime);
  const tags = await readTags(file.body, mime);
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(musicTracks)
    .where(eq(musicTracks.themeId, themeId));
  const [track] = await db
    .insert(musicTracks)
    .values({
      themeId,
      // Tags win over the file name; an admin-typed title/artist wins over tags.
      title: meta.fromFileName ? (tags.title ?? meta.title) : meta.title,
      artist: meta.artist ?? tags.artist,
      durationSec: meta.durationSec,
      storageKey: key,
      coverKey: tags.coverKey,
      mimeType: mime,
      sizeBytes: file.body.length,
      sortOrder: n,
      uploadedByUserId: user.id,
    })
    .returning();
  return track!;
}

/** Replaces the artwork of a track or of a theme (station) with an uploaded image. */
export async function setCover(
  db: Database,
  user: SessionUser,
  target: { kind: "track" | "theme"; id: string },
  file: { body: Buffer; type: string },
) {
  assertSuperAdmin(user);
  if (!isUuid(target.id)) throw notFound();
  if (!COVER_TYPES.has(file.type)) throw new AppError("VALIDATION", "image_type");
  if (file.body.length === 0 || file.body.length > 8 * 1024 * 1024)
    throw new AppError("VALIDATION", "image_size");
  const key = await saveCover(file.body);
  const table = target.kind === "track" ? musicTracks : musicThemes;
  const [old] = await db.select({ coverKey: table.coverKey }).from(table).where(eq(table.id, target.id));
  if (!old) {
    await storage()
      .delete([key])
      .catch(() => undefined);
    throw notFound();
  }
  await db.update(table).set({ coverKey: key }).where(eq(table.id, target.id));
  if (old.coverKey)
    await storage()
      .delete([old.coverKey])
      .catch(() => undefined);
  return { coverKey: key, url: coverUrl(key)! };
}

export async function setTrackActive(db: Database, user: SessionUser, trackId: string, isActive: boolean) {
  assertSuperAdmin(user);
  if (!isUuid(trackId)) throw notFound();
  await db.update(musicTracks).set({ isActive }).where(eq(musicTracks.id, trackId));
}

export async function deleteTrack(db: Database, user: SessionUser, trackId: string) {
  assertSuperAdmin(user);
  if (!isUuid(trackId)) throw notFound();
  const [track] = await db
    .update(musicTracks)
    .set({ deletedAt: new Date() })
    .where(and(eq(musicTracks.id, trackId), isNull(musicTracks.deletedAt)))
    .returning();
  if (track)
    await storage()
      .delete([track.storageKey])
      .catch(() => undefined);
}

/** Audio file for the streaming route (radio is public, so any live track can be played). */
export async function loadTrackFile(db: DbOrTx, trackId: string) {
  if (!isUuid(trackId)) return null;
  const [track] = await db
    .select({ key: musicTracks.storageKey, mime: musicTracks.mimeType })
    .from(musicTracks)
    .innerJoin(musicThemes, eq(musicThemes.id, musicTracks.themeId))
    .where(and(eq(musicTracks.id, trackId), liveTrack, liveTheme));
  if (!track) return null;
  const file = await storage().get(track.key);
  return file ? { body: file.body, contentType: track.mime } : null;
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

/** The restaurant's current subscription: active and not expired, else the pending request. */
async function currentSubscription(db: DbOrTx, restaurantId: string, now = new Date()) {
  const rows = await db
    .select()
    .from(musicSubscriptions)
    .where(
      and(
        eq(musicSubscriptions.restaurantId, restaurantId),
        or(
          and(eq(musicSubscriptions.status, "active"), gt(musicSubscriptions.endsAt, now)),
          eq(musicSubscriptions.status, "pending"),
        ),
      ),
    )
    .orderBy(desc(musicSubscriptions.createdAt));
  return rows.find((r) => r.status === "active") ?? rows[0] ?? null;
}

const trackView = <T extends { id: string; coverKey: string | null }>({ coverKey, ...t }: T) => ({
  ...t,
  url: trackUrl(t.id),
  cover: coverUrl(coverKey),
});

async function themeTracks(db: DbOrTx, themeId: string) {
  return db
    .select({
      id: musicTracks.id,
      title: musicTracks.title,
      artist: musicTracks.artist,
      durationSec: musicTracks.durationSec,
      coverKey: musicTracks.coverKey,
    })
    .from(musicTracks)
    .where(and(eq(musicTracks.themeId, themeId), liveTrack))
    .orderBy(asc(musicTracks.sortOrder), asc(musicTracks.createdAt));
}

/** Everything the restaurant's Music page needs. */
export async function getMusicState(db: Database, ctx: RestaurantContext, now = new Date()) {
  assertCan(ctx, "restaurant.view");
  const [sub, themes] = await Promise.all([
    currentSubscription(db, ctx.restaurant.id, now),
    db
      .select({
        id: musicThemes.id,
        name: musicThemes.name,
        description: musicThemes.description,
        color: musicThemes.color,
        coverKey: musicThemes.coverKey,
        slug: musicThemes.slug,
        radioEnabled: musicThemes.radioEnabled,
        trackCount:
          sql<number>`(select count(*) from music_tracks t where t.theme_id = "music_themes"."id" and t.deleted_at is null and t.is_active)`.mapWith(
            Number,
          ),
      })
      .from(musicThemes)
      .where(liveTheme)
      .orderBy(asc(musicThemes.sortOrder)),
  ]);
  let playlist = null;
  if (sub?.status === "active") {
    const tracks = await themeTracks(db, sub.themeId);
    const key = periodKey(sub.plan, now);
    playlist = {
      period: key,
      nextChangeAt: sub.plan === "weekly" ? nextWeeklyChange(now) : null,
      tracks: playlistFor(tracks, `${sub.themeId}:${key}`).map(trackView),
    };
  }
  return {
    subscription: sub,
    theme: sub ? (themes.find((t) => t.id === sub.themeId) ?? null) : null,
    themes: themes.filter((t) => t.trackCount > 0),
    playlist,
    prices: edition.musicPrices,
    currency: edition.platformCurrency,
  };
}

export const requestSchema = z.object({ plan: z.enum(MUSIC_PLANS), themeId: z.uuid() });

export async function requestSubscription(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof requestSchema>,
) {
  assertCan(ctx, "restaurant.manage");
  const input = requestSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [theme] = await tx
      .select({ id: musicThemes.id })
      .from(musicThemes)
      .where(and(eq(musicThemes.id, input.themeId), liveTheme));
    if (!theme) throw notFound();
    const existing = await currentSubscription(tx, ctx.restaurant.id);
    if (existing?.status === "pending") {
      // Changing the request before it is paid: update it in place.
      const [updated] = await tx
        .update(musicSubscriptions)
        .set({ plan: input.plan, themeId: input.themeId, priceCents: edition.musicPrices[input.plan] })
        .where(eq(musicSubscriptions.id, existing.id))
        .returning();
      return updated!;
    }
    if (existing?.status === "active" && existing.plan === input.plan) {
      // Same plan, other theme: switch immediately, the paid period is unchanged.
      const [updated] = await tx
        .update(musicSubscriptions)
        .set({ themeId: input.themeId })
        .where(eq(musicSubscriptions.id, existing.id))
        .returning();
      return updated!;
    }
    const [created] = await tx
      .insert(musicSubscriptions)
      .values({
        restaurantId: ctx.restaurant.id,
        themeId: input.themeId,
        plan: input.plan,
        priceCents: edition.musicPrices[input.plan],
        requestedByUserId: ctx.user.id,
      })
      .returning();
    await recordAudit(tx, {
      action: "music.subscription_requested",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "music_subscription",
      entityId: created!.id,
      metadata: { plan: input.plan },
    });
    return created!;
  });
}

export async function cancelPendingRequest(db: Database, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.manage");
  await db
    .update(musicSubscriptions)
    .set({ status: "cancelled" })
    .where(
      and(eq(musicSubscriptions.restaurantId, ctx.restaurant.id), eq(musicSubscriptions.status, "pending")),
    );
}

export async function listSubscriptionsForAdmin(db: Database, user: SessionUser) {
  assertSuperAdmin(user);
  return db
    .select({
      id: musicSubscriptions.id,
      plan: musicSubscriptions.plan,
      status: musicSubscriptions.status,
      priceCents: musicSubscriptions.priceCents,
      startsAt: musicSubscriptions.startsAt,
      endsAt: musicSubscriptions.endsAt,
      createdAt: musicSubscriptions.createdAt,
      restaurantId: restaurants.id,
      restaurantName: restaurants.name,
      themeName: musicThemes.name,
    })
    .from(musicSubscriptions)
    .innerJoin(restaurants, eq(restaurants.id, musicSubscriptions.restaurantId))
    .innerJoin(musicThemes, eq(musicThemes.id, musicSubscriptions.themeId))
    .orderBy(desc(musicSubscriptions.createdAt))
    .limit(200);
}

/**
 * Payment received: activate (or extend by) 30 days. Activating a new plan ends the
 * restaurant's other active subscription.
 */
export async function activateSubscription(db: Database, user: SessionUser, id: string, now = new Date()) {
  assertSuperAdmin(user);
  if (!isUuid(id)) throw notFound();
  return db.transaction(async (tx) => {
    const [sub] = await tx
      .select()
      .from(musicSubscriptions)
      .where(eq(musicSubscriptions.id, id))
      .for("update");
    if (!sub) throw notFound();
    if (sub.status === "cancelled") throw conflict("subscription_cancelled");
    const from = sub.status === "active" && sub.endsAt && sub.endsAt > now ? sub.endsAt : now;
    const endsAt = new Date(from.getTime() + SUBSCRIPTION_DAYS * 86_400_000);
    await tx
      .update(musicSubscriptions)
      .set({ status: "expired", endsAt: now })
      .where(
        and(
          eq(musicSubscriptions.restaurantId, sub.restaurantId),
          eq(musicSubscriptions.status, "active"),
          sql`${musicSubscriptions.id} <> ${id}`,
        ),
      );
    const [updated] = await tx
      .update(musicSubscriptions)
      .set({ status: "active", startsAt: sub.startsAt ?? now, endsAt, activatedByUserId: user.id })
      .where(eq(musicSubscriptions.id, id))
      .returning();
    await recordAudit(tx, {
      action: "music.subscription_activated",
      actorUserId: user.id,
      restaurantId: sub.restaurantId,
      entityType: "music_subscription",
      entityId: id,
      metadata: { endsAt: endsAt.toISOString() },
    });
    return updated!;
  });
}

export async function cancelSubscription(db: Database, user: SessionUser, id: string) {
  assertSuperAdmin(user);
  if (!isUuid(id)) throw notFound();
  await db
    .update(musicSubscriptions)
    .set({ status: "cancelled", endsAt: new Date() })
    .where(eq(musicSubscriptions.id, id));
}

// ─── Live radio (public) ─────────────────────────────────────────────────────

export async function listStations(db: Database) {
  const themes = await db
    .select({
      id: musicThemes.id,
      slug: musicThemes.slug,
      name: musicThemes.name,
      description: musicThemes.description,
      color: musicThemes.color,
      coverKey: musicThemes.coverKey,
      createdAt: musicThemes.createdAt,
    })
    .from(musicThemes)
    .where(and(liveTheme, eq(musicThemes.radioEnabled, true)))
    .orderBy(asc(musicThemes.sortOrder));
  const out = [];
  for (const { coverKey, ...th } of themes) {
    const tracks = await themeTracks(db, th.id);
    if (!tracks.length) continue;
    const covers = [...new Set(tracks.map((t) => t.coverKey).filter(Boolean))].slice(0, 4).map(coverUrl);
    const minutes = Math.round(tracks.reduce((s, t) => s + t.durationSec, 0) / 60);
    out.push({
      ...th,
      cover: coverUrl(coverKey) ?? covers[0] ?? null,
      mosaic: covers as string[],
      trackCount: tracks.length,
      minutes,
      tracks: tracks.map(({ coverKey: k, ...t }) => ({ ...t, cover: coverUrl(k) })),
    });
  }
  return out;
}

/** What a station is playing right now, with the offset to seek to. */
export async function nowPlaying(db: Database, slug: string, now = new Date()) {
  const [theme] = await db
    .select()
    .from(musicThemes)
    .where(and(eq(musicThemes.slug, slug), liveTheme, eq(musicThemes.radioEnabled, true)));
  if (!theme) return null;
  const tracks = await themeTracks(db, theme.id);
  const live = radioNow(tracks, theme.createdAt, now);
  if (!live) return null;
  const view = trackView;
  return {
    station: { slug: theme.slug, name: theme.name, color: theme.color, cover: coverUrl(theme.coverKey) },
    track: view(live.track),
    offsetSec: live.offsetSec,
    remainingSec: live.remainingSec,
    upNext: live.upNext.map(view),
    queue: live.queue.map(view),
    serverTime: now.toISOString(),
  };
}

// ─── In-restaurant "now playing" ─────────────────────────────────────────────

export const playbackSchema = z.object({
  trackId: z.uuid().nullable(),
  positionSec: z
    .number()
    .min(0)
    .max(4 * 3600)
    .default(0),
  playing: z.boolean(),
});

/** The dashboard player reports what it plays (track change, play, pause, seek). */
export async function reportPlayback(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof playbackSchema>,
  now = new Date(),
) {
  assertCan(ctx, "restaurant.view");
  const input = playbackSchema.parse(raw);
  if (input.trackId) {
    const sub = await currentSubscription(db, ctx.restaurant.id, now);
    if (sub?.status !== "active") throw notFound();
    const [ok] = await db
      .select({ id: musicTracks.id })
      .from(musicTracks)
      .where(and(eq(musicTracks.id, input.trackId), eq(musicTracks.themeId, sub.themeId)));
    if (!ok) throw notFound();
  }
  const values = {
    trackId: input.trackId,
    isPlaying: input.playing && !!input.trackId,
    startedAt: input.trackId ? new Date(now.getTime() - input.positionSec * 1000) : null,
    updatedAt: now,
  };
  await db
    .insert(musicNowPlaying)
    .values({ restaurantId: ctx.restaurant.id, ...values })
    .onConflictDoUpdate({ target: musicNowPlaying.restaurantId, set: values });
}

/**
 * What guests at the tables see: the song the restaurant is playing now, its cover and
 * progress, and the next songs of the playlist. Null when nothing is playing.
 */
export async function restaurantNowPlaying(db: DbOrTx, restaurantId: string, now = new Date()) {
  const [row] = await db
    .select({
      isPlaying: musicNowPlaying.isPlaying,
      startedAt: musicNowPlaying.startedAt,
      track: {
        id: musicTracks.id,
        title: musicTracks.title,
        artist: musicTracks.artist,
        durationSec: musicTracks.durationSec,
        coverKey: musicTracks.coverKey,
        themeId: musicTracks.themeId,
      },
      theme: { name: musicThemes.name, color: musicThemes.color, coverKey: musicThemes.coverKey },
    })
    .from(musicNowPlaying)
    .innerJoin(musicTracks, eq(musicTracks.id, musicNowPlaying.trackId))
    .innerJoin(musicThemes, eq(musicThemes.id, musicTracks.themeId))
    .where(eq(musicNowPlaying.restaurantId, restaurantId));
  if (!row?.isPlaying || !row.startedAt) return null;
  const positionSec = (now.getTime() - row.startedAt.getTime()) / 1000;
  // The player reports every track change: past the end (+ grace), it stopped silently.
  if (positionSec > row.track.durationSec + 20) return null;

  const sub = await currentSubscription(db, restaurantId, now);
  let upNext: ReturnType<typeof trackView>[] = [];
  if (sub?.status === "active" && sub.themeId === row.track.themeId) {
    const list = playlistFor(
      await themeTracks(db, sub.themeId),
      `${sub.themeId}:${periodKey(sub.plan, now)}`,
    );
    const i = list.findIndex((t) => t.id === row.track.id);
    if (i >= 0)
      upNext = [1, 2, 3]
        .map((k) => list[(i + k) % list.length]!)
        .filter((t) => t.id !== row.track.id)
        .map(trackView);
  }
  const { coverKey, themeId: _t, ...track } = row.track;
  return {
    track: { ...track, cover: coverUrl(coverKey) ?? coverUrl(row.theme.coverKey) },
    theme: { name: row.theme.name, color: row.theme.color },
    positionSec: Math.min(positionSec, row.track.durationSec),
    upNext,
    serverTime: now.toISOString(),
  };
}
export type NowPlaying = NonNullable<Awaited<ReturnType<typeof restaurantNowPlaying>>>;

export type { MusicPlan };

/** True when the restaurant has an active music subscription (guests then poll "now playing"). */
export async function hasActiveMusic(db: DbOrTx, restaurantId: string, now = new Date()) {
  const sub = await currentSubscription(db, restaurantId, now);
  return sub?.status === "active";
}
