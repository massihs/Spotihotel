import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { getAudience, isTrackedPath, recordHit } from "@/server/modules/ops/audience";
import { getGrowthMetrics } from "@/server/modules/admin/service";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1";

describe("site audience", () => {
  it("counts public pages only, without bots, unique visitors per day", async () => {
    expect(isTrackedPath("/")).toBe(true);
    expect(isTrackedPath("/en/pricing")).toBe(true);
    expect(isTrackedPath("/r/brielle")).toBe(true);
    expect(isTrackedPath("/dashboard/abc")).toBe(false);
    expect(isTrackedPath("/table/orders")).toBe(false);

    const before = await getAudience(db, 30);
    const now = new Date();
    expect(
      await recordHit(
        db,
        { path: "/pricing", ip: "10.0.0.1", ua: UA, referrer: "https://l.instagram.com/x" },
        now,
      ),
    ).toBe(true);
    expect(await recordHit(db, { path: "/en/pricing?x=1", ip: "10.0.0.1", ua: UA }, now)).toBe(true);
    expect(await recordHit(db, { path: "/pricing", ip: "10.0.0.1", ua: "Googlebot/2.1" }, now)).toBe(false);
    expect(await recordHit(db, { path: "/dashboard/x", ip: "10.0.0.1", ua: UA }, now)).toBe(false);
    const after = await getAudience(db, 30);
    expect(after.views - before.views).toBe(2);
    expect(after.pages.find((p) => p.path === "/pricing")!.views).toBeGreaterThanOrEqual(2);
    expect(after.referrers.some((r) => r.referrer === "l.instagram.com")).toBe(true);
  });
});

describe("growth metrics", () => {
  it("returns daily orders and activity counts", async () => {
    const g = await getGrowthMetrics(db);
    expect(g.active30d).toBeGreaterThanOrEqual(g.active7d);
    expect(Array.isArray(g.byDay)).toBe(true);
    expect(typeof g.lost30d).toBe("number");
  });
});
