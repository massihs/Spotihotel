/**
 * Pure music logic (no I/O): which tracks make this week's / month's playlist, and what the
 * live radio is playing right now. Deterministic, so every device of a restaurant (and every
 * listener of a station) computes the same thing.
 */
export type MusicPlan = "weekly" | "monthly";
export type RotationTrack = { id: string; durationSec: number };

export const PLAYLIST_SIZE = 30;
const DAY = 86_400_000;
const WEEK = 7 * DAY;
/** Tehran is UTC+03:30 all year; weeks start on Saturday (Iranian calendar week). */
const TEHRAN_OFFSET = 3.5 * 3_600_000;
const SATURDAY_EPOCH = Date.UTC(1970, 0, 3); // 1970-01-03 was a Saturday

/** Persian (Jalali) year and month of a date, in Tehran. */
export function jalaliYearMonth(d: Date) {
  const parts = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "numeric",
  }).formatToParts(d);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: n("year"), month: n("month") };
}

/** Identifies the current rotation period: changes every Saturday 00:00, or every Persian month. */
export function periodKey(plan: MusicPlan, now: Date) {
  if (plan === "weekly") {
    const week = Math.floor((now.getTime() + TEHRAN_OFFSET - SATURDAY_EPOCH) / WEEK);
    return `w${week}`;
  }
  const { year, month } = jalaliYearMonth(now);
  return `m${year}-${month}`;
}

/** Start of the next weekly period (Saturday 00:00 Tehran). Monthly: null (Persian month end). */
export function nextWeeklyChange(now: Date) {
  const week = Math.floor((now.getTime() + TEHRAN_OFFSET - SATURDAY_EPOCH) / WEEK);
  return new Date(SATURDAY_EPOCH + (week + 1) * WEEK - TEHRAN_OFFSET);
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The period's playlist: a seeded shuffle of the theme's tracks, capped at `size`. */
export function playlistFor<T extends RotationTrack>(tracks: T[], seed: string, size = PLAYLIST_SIZE) {
  const rand = mulberry32(hash(seed));
  const list = [...tracks].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list.slice(0, size);
}

/**
 * Live radio clock: the station loops over its tracks since `epoch`; everyone tuning in
 * at the same instant hears the same track at the same second.
 */
export function radioNow<T extends RotationTrack>(tracks: T[], epoch: Date, now: Date) {
  const playable = tracks.filter((t) => t.durationSec > 0);
  const total = playable.reduce((s, t) => s + t.durationSec, 0);
  if (total === 0) return null;
  let pos = ((((now.getTime() - epoch.getTime()) / 1000) % total) + total) % total;
  for (let i = 0; i < playable.length; i++) {
    const track = playable[i]!;
    if (pos < track.durationSec) {
      const upNext = [1, 2, 3].map((k) => playable[(i + k) % playable.length]!);
      // The rest of the loop, in air order: the station's queue.
      const queue = Array.from(
        { length: Math.min(playable.length - 1, 50) },
        (_, k) => playable[(i + k + 1) % playable.length]!,
      );
      return { track, offsetSec: pos, remainingSec: track.durationSec - pos, upNext, queue };
    }
    pos -= track.durationSec;
  }
  return null;
}
