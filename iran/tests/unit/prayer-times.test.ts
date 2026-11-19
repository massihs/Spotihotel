import { describe, expect, it } from "vitest";
import { prayerTimes, zoneOffset } from "@/lib/prayer-times";

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

describe("prayer times", () => {
  it("knows Tehran's offset", () => {
    expect(zoneOffset("2026-11-18", "Asia/Tehran")).toBe(3.5);
  });
  it("computes Tehran's day consistently with the sun", () => {
    const p = prayerTimes("2026-11-18", 35.6892, 51.389, "Asia/Tehran");
    // Solar noon: 12:00 at 52.5°E (UTC+3:30), +4.4 min for 51.39°E, −15 min equation of time.
    expect(Math.abs(minutes(p.dhuhr) - minutes("11:50"))).toBeLessThanOrEqual(2);
    // Late November in Tehran: sunrise about 06:40, sunset about 16:55.
    expect(Math.abs(minutes(p.sunrise) - minutes("06:42"))).toBeLessThanOrEqual(6);
    expect(Math.abs(minutes(p.sunset) - minutes("16:56"))).toBeLessThanOrEqual(6);
    // Maghrib at 4.5° comes a quarter of an hour or so after sunset; dawn at 17.7° ~1h25 before sunrise.
    expect(minutes(p.maghrib) - minutes(p.sunset)).toBeGreaterThanOrEqual(14);
    expect(minutes(p.maghrib) - minutes(p.sunset)).toBeLessThanOrEqual(24);
    expect(minutes(p.sunrise) - minutes(p.fajr)).toBeGreaterThanOrEqual(80);
    expect(minutes(p.sunrise) - minutes(p.fajr)).toBeLessThanOrEqual(95);
  });
  it("orders the day's times", () => {
    const p = prayerTimes("2026-06-21", 36.2972, 59.6067, "Asia/Tehran");
    const list = [p.fajr, p.sunrise, p.dhuhr, p.sunset, p.maghrib, p.isha].map(minutes);
    expect([...list].sort((a, b) => a - b)).toEqual(list);
  });
});
