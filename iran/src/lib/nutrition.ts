/**
 * Nutrition of one portion of a dish (as served). Every value is optional: a restaurant fills
 * what it knows, and the diner's daily summary says what is missing.
 */
export type Nutrition = {
  kcal?: number;
  proteinG?: number;
  carbsG?: number;
  sugarG?: number;
  fatG?: number;
  fiberG?: number;
  saltG?: number;
};

export const NUTRIENTS = ["kcal", "proteinG", "carbsG", "sugarG", "fatG", "fiberG", "saltG"] as const;
export type Nutrient = (typeof NUTRIENTS)[number];

/** Reference intakes for an adult (EU 1169/2011, fibre per EFSA): the default daily goals. */
export const REFERENCE_INTAKE: Required<Nutrition> = {
  kcal: 2000,
  proteinG: 50,
  carbsG: 260,
  sugarG: 90,
  fatG: 70,
  fiberG: 30,
  saltG: 6,
};

/** Above the goal is good for these, bad for the others. */
export const MORE_IS_BETTER: Record<Nutrient, boolean> = {
  kcal: false,
  proteinG: true,
  carbsG: false,
  sugarG: false,
  fatG: false,
  fiberG: true,
  saltG: false,
};

const round = (n: number, decimals: number) => Math.round(n * 10 ** decimals) / 10 ** decimals;

/** Tidy values for display and storage: whole kcal, grams to 0.1 (salt to 0.01). */
export function tidy(n: Nutrition): Nutrition {
  const out: Nutrition = {};
  for (const k of NUTRIENTS) {
    const v = n[k];
    if (v == null || !Number.isFinite(v) || v < 0) continue;
    out[k] = k === "kcal" ? Math.round(v) : k === "saltG" ? round(v, 2) : round(v, 1);
  }
  return out;
}

/** Sum of portions (quantity already applied), plus which nutrients some lines did not have. */
export function sumNutrition(lines: { nutrition: Nutrition | null; quantity: number }[]) {
  const total: Required<Nutrition> = {
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    sugarG: 0,
    fatG: 0,
    fiberG: 0,
    saltG: 0,
  };
  const missing = new Set<Nutrient>();
  let unknown = 0;
  for (const l of lines) {
    if (!l.nutrition || !Object.keys(l.nutrition).length) {
      unknown += l.quantity;
      continue;
    }
    for (const k of NUTRIENTS) {
      const v = l.nutrition[k];
      if (v == null) missing.add(k);
      else total[k] += v * l.quantity;
    }
  }
  return { total: tidy(total) as Required<Nutrition>, missing: [...missing], unknownPortions: unknown };
}
