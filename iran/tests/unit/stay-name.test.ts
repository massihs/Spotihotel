import { describe, expect, it } from "vitest";
import { nameMatches, sameName } from "@/server/modules/pms/portal";

describe("unlocking the stay portal with the guest's name", () => {
  const guest = { firstName: "جواد", lastName: "اصفهانی" };
  it("ignores Arabic letter forms, half-spaces, spaces, accents and case", () => {
    expect(sameName("اصفهاني", "اصفهانی")).toBe(true);
    expect(sameName("حسین‌زاده", "حسین زاده")).toBe(true);
    expect(sameName("kéllér", "Keller")).toBe(true);
    expect(sameName("ك", "ک")).toBe(false); // too short
  });
  it("accepts the last name or the full name in either order", () => {
    expect(nameMatches("اصفهانی", guest)).toBe(true);
    expect(nameMatches("جواد اصفهانی", guest)).toBe(true);
    expect(nameMatches("اصفهانی جواد", guest)).toBe(true);
    expect(nameMatches("جواد", guest)).toBe(false);
    expect(nameMatches("تهرانی", guest)).toBe(false);
  });
});
