/**
 * Prayer times computed on the spot from the hotel's position (no outside service): the sun's
 * position for the day, the Tehran (Institute of Geophysics) angles used in Iran — dawn at 17.7°,
 * maghrib at 4.5°, isha at 14° below the horizon. Accurate to about a minute.
 */

export type PrayerTimes = {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  sunset: string;
  maghrib: string;
  isha: string;
};

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const fix = (a: number, b: number) => {
  const r = a - b * Math.floor(a / b);
  return r < 0 ? r + b : r;
};

function julian(year: number, month: number, day: number) {
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const a = Math.floor(year / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5;
}

function sun(jd: number) {
  const d = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * d, 360);
  const q = fix(280.459 + 0.98564736 * d, 360);
  const l = fix(q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g)), 360);
  const e = 23.439 - 0.00000036 * d;
  const ra = fix(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(l)), Math.cos(rad(l)))) / 15, 24);
  return { decl: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(l)))), eqt: q / 15 - ra };
}

/** Offset of a time zone from UTC on a day, in hours (e.g. 3.5 for Tehran). */
export function zoneOffset(day: string, timeZone: string) {
  const at = new Date(`${day}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return (local - at.getTime()) / 3_600_000;
}

const hhmm = (h: number) => {
  const m = Math.round(fix(h, 24) * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** The day's prayer times ("HH:MM", local time) at a latitude / longitude. */
export function prayerTimes(day: string, lat: number, lng: number, timeZone: string): PrayerTimes {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const jd = julian(y, m, d) - lng / (15 * 24);
  const midDay = (t: number) => fix(12 - sun(jd + t).eqt, 24);
  const angleTime = (angle: number, t: number, before: boolean) => {
    const { decl } = sun(jd + t);
    const noon = midDay(t);
    const x =
      (-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(lat))) /
      (Math.cos(rad(decl)) * Math.cos(rad(lat)));
    const hours = deg(Math.acos(Math.min(1, Math.max(-1, x)))) / 15;
    return noon + (before ? -hours : hours);
  };
  const shift = zoneOffset(day, timeZone) - lng / 15;
  const at = (h: number) => hhmm(h + shift);
  return {
    fajr: at(angleTime(17.7, 5 / 24, true)),
    sunrise: at(angleTime(0.833, 6 / 24, true)),
    dhuhr: at(midDay(12 / 24)),
    sunset: at(angleTime(0.833, 18 / 24, false)),
    maghrib: at(angleTime(4.5, 18 / 24, false)),
    isha: at(angleTime(14, 18 / 24, false)),
  };
}
