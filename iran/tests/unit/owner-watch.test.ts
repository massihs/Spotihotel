import { describe, expect, it } from "vitest";
import { fingerprint, trustScore } from "@/server/modules/owner/watch";

describe("owner's eye", () => {
  it("scores 100 with no signal and caps each kind of signal", () => {
    expect(trustScore({ ghost: 0, unpaid: 0, shortages: 0, broken: 0, cheap: 0 })).toBe(100);
    expect(trustScore({ ghost: 3, unpaid: 0, shortages: 0, broken: 0, cheap: 0 })).toBe(91);
    expect(trustScore({ ghost: 50, unpaid: 50, shortages: 50, broken: 50, cheap: 50 })).toBe(0);
  });
  it("changes the day's fingerprint when a posting changes", () => {
    const a = fingerprint("l1|charge|1000|,l2|payment|-1000|", "a1");
    expect(fingerprint("l1|charge|1000|,l2|payment|-1000|", "a1")).toBe(a);
    expect(fingerprint("l1|charge|900|,l2|payment|-1000|", "a1")).not.toBe(a);
    expect(fingerprint("l1|charge|1000|", "a1")).not.toBe(a);
  });
});
