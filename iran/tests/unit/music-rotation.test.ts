import { describe, expect, it } from "vitest";
import { nextWeeklyChange, periodKey, playlistFor, radioNow } from "@/server/modules/music/rotation";

const tracks = Array.from({ length: 50 }, (_, i) => ({
  id: `t${String(i).padStart(2, "0")}`,
  durationSec: 100,
}));

describe("music rotation", () => {
  it("changes the weekly period on Saturday 00:00 Tehran", () => {
    // Friday 23:59 and Saturday 00:01 Tehran time (UTC+03:30)
    const fri = new Date("2026-10-16T20:29:00Z");
    const sat = new Date("2026-10-16T20:31:00Z");
    expect(periodKey("weekly", fri)).not.toBe(periodKey("weekly", sat));
    expect(nextWeeklyChange(fri).toISOString()).toBe("2026-10-16T20:30:00.000Z");
  });

  it("changes the monthly period with the Persian month", () => {
    expect(periodKey("monthly", new Date("2026-10-16T12:00:00Z"))).toBe(
      periodKey("monthly", new Date("2026-10-20T12:00:00Z")),
    );
    expect(periodKey("monthly", new Date("2026-10-21T12:00:00Z"))).not.toBe(
      periodKey("monthly", new Date("2026-10-23T12:00:00Z")),
    );
  });

  it("builds a stable playlist per period, different between periods", () => {
    const a = playlistFor(tracks, "theme:w1");
    expect(a).toHaveLength(30);
    expect(playlistFor(tracks, "theme:w1")).toEqual(a);
    expect(playlistFor(tracks, "theme:w2").map((t) => t.id)).not.toEqual(a.map((t) => t.id));
  });

  it("computes the live radio position from the station clock", () => {
    const epoch = new Date("2026-01-01T00:00:00Z");
    const now = new Date(epoch.getTime() + 250_000); // 250 s in: 3rd track, 50 s
    const r = radioNow(tracks.slice(0, 3), epoch, now)!;
    expect(r.track.id).toBe("t02");
    expect(r.offsetSec).toBe(50);
    const loop = radioNow(tracks.slice(0, 3), epoch, new Date(epoch.getTime() + 310_000))!;
    expect(loop.track.id).toBe("t00");
    expect(radioNow([], epoch, now)).toBeNull();
  });
});
