import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { musicThemes } from "@/server/db/schema";
import { setStorageDriver, type StorageDriver } from "@/server/infra/storage";
import {
  activateSubscription,
  addTrack,
  createTheme,
  deleteTheme,
  getMusicState,
  loadTrackFile,
  nowPlaying,
  reportPlayback,
  requestSubscription,
  restaurantNowPlaying,
} from "@/server/modules/music/service";
import { createOwnerWithRestaurant, createUser } from "../helpers/factories";

class MemoryStorage implements StorageDriver {
  files = new Map<string, Buffer>();
  async put(k: string, b: Buffer) {
    this.files.set(k, b);
  }
  async get(k: string) {
    const b = this.files.get(k);
    return b ? { body: b, contentType: "audio/mpeg" } : null;
  }
  async delete(keys: string[]) {
    keys.forEach((k) => this.files.delete(k));
  }
  publicUrl(k: string) {
    return `/f/${k}`;
  }
}

const mp3 = { body: Buffer.from("ID3fake-audio"), type: "audio/mpeg" };

async function themeWithTracks(n = 3) {
  const { sessionUser: admin } = await createUser({ superAdmin: true });
  const theme = await createTheme(db, admin, { name: `Jazz ${Math.random()}` });
  for (let i = 0; i < n; i++)
    await addTrack(db, admin, theme.id, mp3, { title: `Track ${i + 1}`, durationSec: 120 });
  return { admin, theme };
}

beforeEach(() => setStorageDriver(new MemoryStorage()));
afterEach(() => setStorageDriver(undefined));

describe("music", () => {
  it("only super admins manage themes and tracks", async () => {
    const owner = await createOwnerWithRestaurant("Café");
    await expect(createTheme(db, owner.sessionUser, { name: "Lounge" })).rejects.toThrow();
    const { admin, theme } = await themeWithTracks(0);
    await expect(
      addTrack(
        db,
        admin,
        theme.id,
        { body: Buffer.from("x"), type: "image/png" },
        { title: "x", durationSec: 3 },
      ),
    ).rejects.toMatchObject({ message: "audio_type" });
  });

  it("requests, activates and serves the period playlist", async () => {
    const { admin, theme } = await themeWithTracks(3);
    const owner = await createOwnerWithRestaurant("Café");
    const sub = await requestSubscription(db, owner.ctx, { plan: "weekly", themeId: theme.id });
    expect(sub.status).toBe("pending");
    expect((await getMusicState(db, owner.ctx)).playlist).toBeNull();

    const active = await activateSubscription(db, admin, sub.id);
    expect(active.status).toBe("active");
    expect(active.endsAt!.getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);

    const state = await getMusicState(db, owner.ctx);
    expect(state.playlist!.tracks).toHaveLength(3);
    expect(state.playlist!.nextChangeAt).toBeInstanceOf(Date);
    const file = await loadTrackFile(db, state.playlist!.tracks[0]!.id);
    expect(file?.contentType).toBe("audio/mpeg");

    // A theme with subscribers cannot be removed.
    await expect(deleteTheme(db, admin, theme.id)).rejects.toMatchObject({
      message: "theme_has_subscribers",
    });
  });

  it("puts the station on air from its own clock", async () => {
    const { theme } = await themeWithTracks(2);
    const start = new Date("2026-01-01T00:00:00Z");
    await db.update(musicThemes).set({ createdAt: start }).where(eq(musicThemes.id, theme.id));
    const live = await nowPlaying(db, theme.slug, new Date(start.getTime() + 150_000));
    expect(live?.track.title).toBe("Track 2");
    expect(live?.offsetSec).toBe(30);
    await db.update(musicThemes).set({ radioEnabled: false }).where(eq(musicThemes.id, theme.id));
    expect(await nowPlaying(db, theme.slug)).toBeNull();
  });

  it("shows guests the song the restaurant is playing", async () => {
    const { admin, theme } = await themeWithTracks(3);
    const owner = await createOwnerWithRestaurant("Café");
    const rid = owner.ctx.restaurant.id;
    expect(await restaurantNowPlaying(db, rid)).toBeNull();
    const sub = await requestSubscription(db, owner.ctx, { plan: "monthly", themeId: theme.id });
    await activateSubscription(db, admin, sub.id);
    const [first] = (await getMusicState(db, owner.ctx)).playlist!.tracks;

    const t0 = new Date();
    await reportPlayback(db, owner.ctx, { trackId: first!.id, positionSec: 30, playing: true }, t0);
    const np = await restaurantNowPlaying(db, rid, new Date(t0.getTime() + 10_000));
    expect(np?.track.title).toBe(first!.title);
    expect(np?.positionSec).toBeCloseTo(40, 0);
    expect(np?.upNext).toHaveLength(2);

    // Past the end of the song (no report since): the player stopped.
    expect(await restaurantNowPlaying(db, rid, new Date(t0.getTime() + 200_000))).toBeNull();
    // Paused: nothing to show.
    await reportPlayback(db, owner.ctx, { trackId: first!.id, positionSec: 50, playing: false });
    expect(await restaurantNowPlaying(db, rid)).toBeNull();

    // A track outside the subscription is refused.
    const other = await themeWithTracks(1);
    const [foreign] = (await getMusicState(db, owner.ctx)).themes
      .filter((x) => x.id === other.theme.id)
      .map((x) => x.id);
    expect(foreign).toBe(other.theme.id);
    await expect(
      reportPlayback(db, owner.ctx, {
        // Another id for sure (the last hex digit changed, whatever it was).
        trackId: first!.id.replace(/.$/, (c) => (c === "0" ? "1" : "0")),
        positionSec: 0,
        playing: true,
      }),
    ).rejects.toThrow();
  });
});
