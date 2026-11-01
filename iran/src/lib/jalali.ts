/** Persian (Jalali / Solar Hijri) calendar helpers, built on Intl (no extra dependency). */

const yearFmt = new Map<string, Intl.DateTimeFormat>();

/** Jalali year of a date in a time zone, e.g. 1405. */
export function jalaliYear(date: Date, timeZone = "Asia/Tehran"): number {
  let f = yearFmt.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", { year: "numeric", timeZone });
    yearFmt.set(timeZone, f);
  }
  return Number.parseInt(f.format(date).replace(/[^0-9]/g, ""), 10);
}

/** "۱۴۰۵/۰۷/۲۰ ۱۴:۳۵" — Jalali date and time with Persian digits. */
export function jalaliDateTime(date: Date, timeZone = "Asia/Tehran"): string {
  const d = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(date);
  const t = new Intl.DateTimeFormat("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
  return `${d} ${t}`;
}
