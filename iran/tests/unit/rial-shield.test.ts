import { describe, expect, it } from "vitest";
import { indexedTarget, smoothedRate } from "@/server/modules/pms/shield";

describe("rial shield", () => {
  it("prices a foreign amount at the hotel's rate, rounded", () => {
    // 48 USD at 105 000 toman (×1000 cents), rounded to 10 000 toman.
    expect(indexedTarget(4_800, 105_000_000, 10_000_000)).toBe(5_040_000_000);
    expect(indexedTarget(4_850, 105_000_000, 10_000_000)).toBe(5_090_000_000);
  });
  it("moves at most the daily cap toward the target", () => {
    expect(smoothedRate(4_000_000_000, 5_000_000_000, 1_500, 10_000_000)).toBe(4_600_000_000);
    expect(smoothedRate(4_000_000_000, 4_200_000_000, 1_500, 10_000_000)).toBe(4_200_000_000);
    expect(smoothedRate(4_000_000_000, 3_000_000_000, 1_000, 10_000_000)).toBe(3_600_000_000);
    expect(smoothedRate(4_000_000_000, 5_000_000_000, 0, 10_000_000)).toBe(5_000_000_000);
  });
});
