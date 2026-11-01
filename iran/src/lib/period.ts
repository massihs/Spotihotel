/** Report periods in the restaurant's time zone. Days are "YYYY-MM-DD" (Gregorian, ISO). */

export const PRESETS = ["today", "7d", "30d", "month", "custom"] as const;
export type Preset = (typeof PRESETS)[number];

const DAY = 86_400_000;

function offsetMs(at: number, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(at))
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!) - at;
}

/** Midnight of a local day, as an instant. */
export function dayStart(day: string, tz: string) {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!);
  return new Date(guess - offsetMs(guess - offsetMs(guess, tz), tz));
}

/** A local wall-clock time ("2026-03-21", "20:30") as an instant, DST-safe. */
export function wallTime(day: string, hhmm: string, tz: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const midnight = dayStart(day, tz).getTime();
  const guess = midnight + ((h ?? 0) * 60 + (m ?? 0)) * 60_000;
  return new Date(guess + offsetMs(midnight, tz) - offsetMs(guess, tz));
}

export function localDay(at: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(at);
}

const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/**
 * Resolves `?p=7d` or `?from=…&to=…` (inclusive days) to [from, to) instants.
 * "month" is the current Jalali month (Iran) or calendar month elsewhere.
 */
export function resolvePeriod(
  sp: { p?: unknown; from?: unknown; to?: unknown },
  tz: string,
  jalali = true,
  now = new Date(),
) {
  const today = localDay(now, tz);
  let preset: Preset = (PRESETS as readonly string[]).includes(String(sp.p)) ? (sp.p as Preset) : "30d";
  let first = today;
  let last = today;
  if (preset === "custom" || isDay(sp.from)) {
    if (isDay(sp.from) && isDay(sp.to) && sp.from <= sp.to) {
      preset = "custom";
      first = sp.from;
      last = sp.to > today ? today : sp.to;
    } else preset = "30d";
  }
  if (preset === "7d") first = addDays(today, -6);
  if (preset === "30d") first = addDays(today, -29);
  if (preset === "month") {
    const dom = jalali
      ? Number(
          new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", { timeZone: tz, day: "numeric" }).format(now),
        )
      : Number(today.slice(8));
    first = addDays(today, -(dom - 1));
  }
  return {
    preset,
    first,
    last,
    from: dayStart(first, tz),
    to: dayStart(addDays(last, 1), tz),
    days: Math.round((Date.parse(last) - Date.parse(first)) / DAY) + 1,
  };
}
export type Period = ReturnType<typeof resolvePeriod>;
