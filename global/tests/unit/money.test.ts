import { describe, expect, it } from "vitest";
import { divRound, formatMoney, parseMoney, sumCents, taxFromGross, taxFromNet } from "@/lib/money";

describe("money", () => {
  it("parses user input into integer cents", () => {
    expect(parseMoney("19,90")).toBe(1990);
    expect(parseMoney("19.9")).toBe(1990);
    expect(parseMoney("19")).toBe(1900);
    expect(parseMoney(" 0,05 ")).toBe(5);
    expect(parseMoney("19,999")).toBeNull();
    expect(parseMoney("-3")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });

  it("avoids floating point drift", () => {
    // 0.1 + 0.2 !== 0.3 in floats; in cents it is exact.
    expect(sumCents([10, 20])).toBe(30);
    expect(sumCents([1990, 1990, 1990])).toBe(5970);
    expect(() => sumCents([1.5])).toThrow();
  });

  it("rounds half-up symmetrically", () => {
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(-5, 2)).toBe(-3);
    expect(divRound(4, 3)).toBe(1);
    expect(() => divRound(1, 0)).toThrow();
  });

  it("extracts VAT from tax-inclusive prices", () => {
    // 11.00 € TTC at 10% → 1.00 € of VAT
    expect(taxFromGross(1100, 1000)).toBe(100);
    // 19.90 € TTC at 10% → 1.809… → 1.81 €
    expect(taxFromGross(1990, 1000)).toBe(181);
    // 6.50 € TTC at 20% → 1.0833 → 1.08 €
    expect(taxFromGross(650, 2000)).toBe(108);
    expect(taxFromGross(1000, 0)).toBe(0);
  });

  it("computes VAT on tax-exclusive prices", () => {
    expect(taxFromNet(1000, 2000)).toBe(200);
    expect(taxFromNet(1999, 550)).toBe(110);
  });

  it("formats with the restaurant currency", () => {
    expect(formatMoney(1990, "EUR", "fr-FR").replace(/\s/g, " ")).toBe("19,90 €");
  });
});

describe("large amounts (Rial)", () => {
  it("parses Persian digits and separators", () => {
    expect(parseMoney("۱۲۰۰۰۰")).toBe(12_000_000);
    expect(parseMoney("۱۲۰٬۰۰۰")).toBe(12_000_000);
    expect(parseMoney("٢٥٫٥")).toBe(2550);
    expect(parseMoney("99999999999")).toBe(9_999_999_999_900);
    expect(parseMoney("999999999999")).toBeNull();
  });

  it("computes exact VAT beyond 2^53 intermediate products", () => {
    // 50 billion rials, 10 % VAT included: 50e9 × 100 cents × 1000 bps overflows a double's exact range.
    const gross = 50_000_000_000 * 100;
    expect(taxFromGross(gross, 1000)).toBe(454_545_454_545);
    expect(taxFromNet(gross, 1000)).toBe(500_000_000_000);
  });
});
