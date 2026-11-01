import { describe, expect, it } from "vitest";
import { computeTotals, lineKey, priceLine, type PricedProduct } from "@/server/modules/pricing";

const steak: PricedProduct = {
  id: "p1",
  name: "Entrecôte",
  priceCents: 3200,
  isAvailable: true,
  taxRateBps: 1000,
  optionGroups: [
    {
      id: "g-cuisson",
      name: "Cuisson",
      minSelect: 1,
      maxSelect: 1,
      values: [
        { id: "bleu", name: "Bleu", priceDeltaCents: 0, isAvailable: true },
        { id: "saignant", name: "Saignant", priceDeltaCents: 0, isAvailable: true },
      ],
    },
    {
      id: "g-sup",
      name: "Suppléments",
      minSelect: 0,
      maxSelect: 2,
      values: [
        { id: "fromage", name: "Fromage", priceDeltaCents: 200, isAvailable: true },
        { id: "frites", name: "Frites", priceDeltaCents: 300, isAvailable: true },
        { id: "truffe", name: "Truffe", priceDeltaCents: 900, isAvailable: false },
      ],
    },
  ],
};

describe("priceLine", () => {
  it("prices options and quantity in integer cents", () => {
    const r = priceLine(steak, ["frites", "saignant", "fromage"], 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.line).toMatchObject({
      unitPriceCents: 3200,
      optionsTotalCents: 500,
      unitTotalCents: 3700,
      lineTotalCents: 7400,
    });
    // Sorted by group, then by value order.
    expect(r.line.selections.map((s) => s.valueId)).toEqual(["saignant", "fromage", "frites"]);
  });

  it("enforces required groups and maximums", () => {
    expect(priceLine(steak, [], 1)).toEqual({
      ok: false,
      error: { code: "too_few_options", groupId: "g-cuisson", min: 1 },
    });
    expect(priceLine(steak, ["bleu", "saignant"], 1)).toMatchObject({
      ok: false,
      error: { code: "too_many_options", groupId: "g-cuisson" },
    });
    expect(priceLine(steak, ["bleu", "fromage", "frites", "frites"], 1)).toMatchObject({
      ok: false,
      error: { code: "duplicate_option" },
    });
  });

  it("rejects unknown, foreign and unavailable options, sold-out products and bad quantities", () => {
    expect(priceLine(steak, ["bleu", "ketchup"], 1)).toMatchObject({
      ok: false,
      error: { code: "invalid_option" },
    });
    expect(priceLine(steak, ["bleu", "truffe"], 1)).toMatchObject({
      ok: false,
      error: { code: "option_unavailable" },
    });
    expect(priceLine({ ...steak, isAvailable: false }, ["bleu"], 1)).toMatchObject({
      ok: false,
      error: { code: "product_unavailable" },
    });
    for (const q of [0, -1, 1.5, 100, Number.NaN])
      expect(priceLine(steak, ["bleu"], q)).toMatchObject({ ok: false, error: { code: "invalid_quantity" } });
  });
});

describe("computeTotals", () => {
  it("extracts VAT per rate from tax-inclusive prices", () => {
    const t = computeTotals(
      [
        { lineTotalCents: 2000, taxRateBps: 1000 },
        { lineTotalCents: 500, taxRateBps: 1000 },
        { lineTotalCents: 650, taxRateBps: 2000 },
      ],
      true,
    );
    expect(t.totalCents).toBe(3150);
    expect(t.subtotalCents).toBe(3150);
    expect(t.taxes).toEqual([
      { rateBps: 1000, baseCents: 2273, taxCents: 227 },
      { rateBps: 2000, baseCents: 542, taxCents: 108 },
    ]);
    expect(t.taxCents).toBe(335);
  });

  it("adds VAT on tax-exclusive prices", () => {
    const t = computeTotals([{ lineTotalCents: 1000, taxRateBps: 2000 }], false);
    expect(t).toMatchObject({ subtotalCents: 1000, taxCents: 200, totalCents: 1200 });
  });

  it("handles an empty cart", () => {
    expect(computeTotals([], true)).toEqual({ subtotalCents: 0, taxCents: 0, totalCents: 0, taxes: [] });
  });
});

describe("lineKey", () => {
  it("ignores option order and note case/whitespace", () => {
    expect(lineKey("p", ["b", "a"], " Sans oignons ")).toBe(lineKey("p", ["a", "b"], "sans oignons"));
    expect(lineKey("p", ["a"], null)).not.toBe(lineKey("p", ["a"], "x"));
  });
});
