/**
 * Persian (Jalali / Solar Hijri) calendar arithmetic, both directions, without dependency.
 * Algorithm of jalaali-js (Borkowski's 33-year cycles), valid for years -61…3177.
 * Days are exchanged as ISO strings "YYYY-MM-DD" (Gregorian, what the database stores).
 */

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
];
const div = (a: number, b: number) => ~~(a / b);
const mod = (a: number, b: number) => a - ~~(a / b) * b;

function jalCal(jy: number) {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0]!;
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i]!;
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  let k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export type JDate = { jy: number; jm: number; jd: number };

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-03-21" → { jy: 1405, jm: 1, jd: 1 } */
export function toJalali(day: string): JDate {
  const [y, m, d] = day.split("-").map(Number);
  return d2j(g2d(y!, m!, d!));
}

/** { 1405, 1, 1 } → "2026-03-21" */
export function fromJalali(jy: number, jm: number, jd: number): string {
  const g = d2g(j2d(jy, jm, jd));
  return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
}

export const isLeapJalaliYear = (jy: number) => jalCal(jy).leap === 0;

export function jalaliMonthLength(jy: number, jm: number) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaliYear(jy) ? 30 : 29;
}

/** "1405-08" — the Jalali month of a Gregorian day (budget and tax keys in Iran). */
export function jalaliMonthKey(day: string) {
  const j = toJalali(day);
  return `${j.jy}-${pad(j.jm)}`;
}

/** First and last Gregorian days of a Jalali month key "1405-08". */
export function jalaliMonthRange(key: string) {
  const [jy, jm] = key.split("-").map(Number);
  return { first: fromJalali(jy!, jm!, 1), last: fromJalali(jy!, jm!, jalaliMonthLength(jy!, jm!)) };
}

/** First day (Gregorian) of the Jalali year containing a day: 1 Farvardin, the Iranian fiscal year. */
export function jalaliYearStart(day: string) {
  return fromJalali(toJalali(day).jy, 1, 1);
}

/**
 * Locale tag for Intl date formatting: the Iran edition always shows the Persian calendar (also in
 * English and Arabic), with Persian digits in Persian.
 */
export function calendarLocale(locale: string, edition: string) {
  if (edition !== "iran") return locale;
  return `${locale === "fa" ? "fa-IR" : locale}-u-ca-persian`;
}

/**
 * Formats a date, setting a Persian-calendar date that has both weekday and year the usual way:
 * ICU writes it "۱۴۰۵ آبان ۱۵, جمعه" in Persian; this gives "جمعه ۱۵ آبان ۱۴۰۵".
 */
export function formatCalendarDate(fmt: Intl.DateTimeFormat, date: Date): string {
  const o = fmt.resolvedOptions();
  if (!(o.locale.startsWith("fa") && o.calendar === "persian" && o.weekday && o.year))
    return fmt.format(date);
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return [get("weekday"), get("day"), get("month"), get("year")].filter(Boolean).join(" ");
}
