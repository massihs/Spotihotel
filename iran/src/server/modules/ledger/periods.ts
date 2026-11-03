import { EDITION } from "@/config/edition";
import { addDays } from "@/server/modules/pms/calc";
import {
  jalaliMonthKey,
  jalaliMonthRange,
  jalaliYearStart,
  toJalali,
  fromJalali,
} from "@/lib/jalali-calendar";

/**
 * Accounting periods. In Iran they follow the Persian calendar: months are Jalali months and the
 * fiscal year starts on 1 Farvardin (Nowruz); elsewhere calendar months and 1 January.
 * Month keys are "YYYY-MM" in the period's own calendar ("1405-08" or "2026-11").
 */
const iran = (edition = EDITION) => edition === "iran";

export function monthKeyOf(day: string, edition = EDITION) {
  return iran(edition) ? jalaliMonthKey(day) : day.slice(0, 7);
}

export function monthRange(key: string, edition = EDITION) {
  if (iran(edition)) return jalaliMonthRange(key);
  const [y, m] = key.split("-").map(Number);
  const next = m === 12 ? `${y! + 1}-01-01` : `${y}-${String(m! + 1).padStart(2, "0")}-01`;
  return { first: `${key}-01`, last: addDays(next, -1) };
}

export const monthStart = (day: string, edition = EDITION) =>
  monthRange(monthKeyOf(day, edition), edition).first;

export function fiscalYearStart(day: string, edition = EDITION) {
  return iran(edition) ? jalaliYearStart(day) : `${day.slice(0, 4)}-01-01`;
}

/** Month keys from the month of `from` to the month of `to`, inclusive. */
export function monthsBetween(from: string, to: string, edition = EDITION) {
  const out: string[] = [];
  let day = monthStart(from, edition);
  for (let i = 0; i < 240 && day <= to; i++) {
    const key = monthKeyOf(day, edition);
    out.push(key);
    day = addDays(monthRange(key, edition).last, 1);
  }
  return out;
}

/** The 12 month keys of the fiscal year containing a day. */
export function fiscalYearMonths(day: string, edition = EDITION) {
  const start = fiscalYearStart(day, edition);
  return monthsBetween(
    start,
    addDays(
      iran(edition) ? fromJalali(toJalali(start).jy + 1, 1, 1) : `${Number(start.slice(0, 4)) + 1}-01-01`,
      -1,
    ),
    edition,
  );
}

/** Iranian VAT returns are seasonal: 1 = spring (Farvardin–Khordad) … 4 = winter. */
export const seasonOf = (key: string) => Math.ceil(Number(key.slice(5, 7)) / 3);
