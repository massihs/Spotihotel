import { describe, expect, it } from "vitest";
import { formatCalendarDate } from "@/lib/jalali-calendar";

const day = new Date("2026-11-06T12:00:00Z");
const fmt = (locale: string, opts: Intl.DateTimeFormatOptions) =>
  formatCalendarDate(new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }), day);

describe("formatCalendarDate", () => {
  it("sets a Persian date with weekday and year as weekday, day, month, year", () => {
    expect(
      fmt("fa-IR-u-ca-persian", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    ).toBe("جمعه ۱۵ آبان ۱۴۰۵");
  });

  it("leaves every other format to Intl", () => {
    expect(fmt("fa-IR-u-ca-persian", { day: "numeric", month: "long", year: "numeric" })).toBe(
      "۱۵ آبان ۱۴۰۵",
    );
    expect(fmt("fa-IR-u-ca-persian", { weekday: "long", day: "numeric", month: "long" })).toBe(
      "جمعه ۱۵ آبان",
    );
    expect(fmt("en-u-ca-persian", { weekday: "long", day: "numeric", month: "long", year: "numeric" })).toBe(
      new Intl.DateTimeFormat("en-u-ca-persian", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(day),
    );
  });
});
