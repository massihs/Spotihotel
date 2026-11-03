import { describe, expect, it } from "vitest";
import {
  fromJalali,
  jalaliMonthKey,
  jalaliMonthLength,
  jalaliMonthRange,
  jalaliYearStart,
  toJalali,
} from "@/lib/jalali-calendar";

const intl = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  timeZone: "UTC",
});
const viaIntl = (day: string) => {
  const p = Object.fromEntries(
    intl.formatToParts(new Date(`${day}T12:00:00Z`)).map((x) => [x.type, x.value]),
  );
  return { jy: Number(p.year), jm: Number(p.month), jd: Number(p.day) };
};

describe("jalali calendar", () => {
  it("agrees with Intl every day from 2015 to 2035, both ways", () => {
    let t = Date.UTC(2015, 0, 1);
    const end = Date.UTC(2035, 11, 31);
    for (; t <= end; t += 86_400_000) {
      const day = new Date(t).toISOString().slice(0, 10);
      const j = toJalali(day);
      expect(j).toEqual(viaIntl(day));
      expect(fromJalali(j.jy, j.jm, j.jd)).toBe(day);
    }
  });

  it("knows Nowruz, month lengths and keys", () => {
    expect(fromJalali(1405, 1, 1)).toBe("2026-03-21");
    expect(jalaliYearStart("2026-11-03")).toBe("2026-03-21");
    expect(jalaliMonthKey("2026-11-03")).toBe("1405-08");
    expect(jalaliMonthRange("1405-08")).toEqual({ first: "2026-10-23", last: "2026-11-21" });
    expect(jalaliMonthLength(1405, 1)).toBe(31);
    expect(jalaliMonthLength(1405, 7)).toBe(30);
    expect([1403, 1404].map((y) => jalaliMonthLength(y, 12))).toEqual([30, 29]);
  });
});
