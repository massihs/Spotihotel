import { describe, expect, it } from "vitest";
import { sumNutrition, tidy } from "@/lib/nutrition";
import { INGREDIENTS, RECIPES } from "@/server/modules/nutrition/catalog";
import { autoNutrition, estimateDish, usdaPer100 } from "@/server/modules/nutrition/estimate";

describe("food database", () => {
  it("ties every catalogue ingredient to a USDA entry (or explicit values) and every recipe to known ingredients", () => {
    const keys = new Set(INGREDIENTS.map((i) => i.key));
    for (const i of INGREDIENTS) expect(i.custom ?? usdaPer100(i.usda!), i.key).toBeTruthy();
    for (const r of RECIPES) for (const [k] of r.parts) expect(keys.has(k), `${r.key}: ${k}`).toBe(true);
    // USDA values, e.g. cooked white rice: 130 kcal, 2.69 g protein per 100 g.
    expect(usdaPer100(168878)?.slice(0, 2)).toEqual([130, 2.69]);
  });
});

describe("dish estimate", () => {
  it("a Caesar salad named in any language has chicken, protein, fat and salt", () => {
    for (const name of ["Salade César", "سالاد سزار", "Caesar salad"]) {
      const e = estimateDish({ name });
      expect(e.recipe, name).toBe("caesar_salad");
      expect(e.nutrition.proteinG!).toBeGreaterThan(35);
      expect(e.nutrition.fatG!).toBeGreaterThan(15);
      expect(e.nutrition.saltG!).toBeGreaterThan(1);
      expect(e.matched.some((m) => m.ref === "usda:171477")).toBe(true); // roasted chicken breast
    }
  });

  it("reads Persian ingredient lists, quantities and the dish weight", () => {
    const e = estimateDish({
      ingredients: "برنج ایرانی، کباب کوبیده ۲ سیخ، گوجه کبابی، کره",
      weightGrams: 450,
    });
    expect(e.unknown).toEqual([]);
    expect(e.matched).toHaveLength(4);
    expect(e.matched.reduce((s, m) => s + m.grams, 0)).toBeCloseTo(450, -1);
    expect(e.nutrition.kcal).toBeGreaterThan(600);
    expect(e.nutrition.proteinG).toBeGreaterThan(30);
  });

  it("keeps written grams, does not take a longer word for a shorter one, reports unknown words", () => {
    const e = estimateDish({ ingredients: "poulet grillé 120 g, laitue, quinoa, xyzzy" });
    expect(e.matched.find((m) => m.text.startsWith("poulet"))?.grams).toBe(120);
    expect(e.unknown).toEqual(["xyzzy"]);
    expect(estimateDish({ ingredients: "سیب‌زمینی ۱۰۰ گرم" }).nutrition.kcal).toBe(86); // not apple
    expect(estimateDish({ ingredients: "تخم مرغ ۱۰۰ گرم" }).nutrition.proteinG).toBe(12.6); // not chicken
  });

  it("brings the estimate to the calories the restaurant declared", () => {
    const n = autoNutrition({ name: "سالاد سزار", ingredients: null, weightGrams: null, caloriesKcal: 450 })!;
    expect(n.kcal).toBe(450);
    expect(n.proteinG).toBeGreaterThan(25);
    expect(autoNutrition({ name: "???", ingredients: null, weightGrams: null, caloriesKcal: 300 })).toEqual({
      kcal: 300,
    });
  });

  it("sums portions", () => {
    const s = sumNutrition([
      { nutrition: { kcal: 500, proteinG: 20 }, quantity: 2 },
      { nutrition: null, quantity: 1 },
    ]);
    expect(s.total.kcal).toBe(1000);
    expect(s.unknownPortions).toBe(1);
    expect(tidy({ kcal: 99.6, proteinG: 1.234, saltG: 1.236, fatG: -1 })).toEqual({
      kcal: 100,
      proteinG: 1.2,
      saltG: 1.24,
    });
  });
});
