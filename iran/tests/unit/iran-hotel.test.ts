import { describe, expect, it } from "vitest";
import { isIranNationalCode } from "@/lib/iran-id";
import {
  fiscalYearMonths,
  fiscalYearStart,
  monthKeyOf,
  monthRange,
  monthsBetween,
  seasonOf,
} from "@/server/modules/ledger/periods";
import { DEFAULT_CHART, IRAN_CHART, moneyAccountOf } from "@/server/modules/ledger/chart";

const withCheck = (nine: string) => {
  const sum = nine.split("").reduce((s, d, i) => s + Number(d) * (10 - i), 0);
  const r = sum % 11;
  return nine + String(r < 2 ? r : 11 - r);
};

describe("Iranian hotel rules", () => {
  it("checks national codes (check digit, Persian digits, repeated digits)", () => {
    const ok = withCheck("001234567");
    expect(isIranNationalCode(ok)).toBe(true);
    expect(isIranNationalCode(ok.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!))).toBe(true);
    expect(isIranNationalCode(ok.slice(0, 9) + ((Number(ok[9]) + 1) % 10))).toBe(false);
    expect(isIranNationalCode("1111111111")).toBe(false);
    expect(isIranNationalCode("12345")).toBe(false);
  });

  it("uses Jalali months and a fiscal year starting on Nowruz", () => {
    expect(monthKeyOf("2026-11-03", "iran")).toBe("1405-08");
    expect(monthKeyOf("2026-11-03", "global")).toBe("2026-11");
    expect(fiscalYearStart("2026-11-03", "iran")).toBe("2026-03-21");
    expect(fiscalYearStart("2026-03-20", "iran")).toBe("2025-03-21");
    expect(fiscalYearStart("2026-11-03", "global")).toBe("2026-01-01");
    expect(monthRange("1405-12", "iran")).toEqual({ first: "2027-02-20", last: "2027-03-20" });
    expect(monthsBetween("2026-10-20", "2026-11-25", "iran")).toEqual(["1405-07", "1405-08", "1405-09"]);
    const year = fiscalYearMonths("2026-11-03", "iran");
    expect(year).toHaveLength(12);
    expect([year[0], year[11]]).toEqual(["1405-01", "1405-12"]);
    expect(fiscalYearMonths("2026-11-03", "global")[0]).toBe("2026-01");
    expect(["1405-01", "1405-04", "1405-08", "1405-12"].map(seasonOf)).toEqual([1, 2, 3, 4]);
  });

  it("has the same automatic accounts in the Iranian and default charts", () => {
    const keys = (c: typeof IRAN_CHART) =>
      c
        .map((a) => a.key)
        .filter(Boolean)
        .sort();
    expect(keys(IRAN_CHART)).toEqual(keys(DEFAULT_CHART));
    expect(new Set(IRAN_CHART.map((a) => a.code)).size).toBe(IRAN_CHART.length);
    expect(moneyAccountOf("cheque")).toBe("cheques_receivable");
  });
});
