import { asciiDigits } from "@/lib/phone";
import { tidy, type Nutrition } from "@/lib/nutrition";
import { INGREDIENTS, RECIPES, type Per100 } from "./catalog";
import usda from "./data/usda-sr-legacy.json";

/**
 * Nutrition of a dish from its name and ingredient list (Persian, French or English).
 * Values per 100 g come from USDA FoodData Central (SR Legacy, public domain), through the
 * multilingual catalogue; a dish named after a known recipe (Caesar salad, chelo kabab…) uses
 * that recipe when the ingredient list says too little.
 */

type UsdaRow = [number, string, number, ...(number | null)[]];
const USDA = new Map<number, UsdaRow>((usda.foods as unknown as UsdaRow[]).map((f) => [f[0], f]));
export const USDA_SOURCE = usda.source;

export function usdaPer100(id: number): Per100 | null {
  const f = USDA.get(id);
  if (!f) return null;
  return [3, 4, 5, 6, 7, 8, 9].map((i) => (f[i] as number | null) ?? 0) as Per100;
}

/** Lower case, Arabic ي/ك → Persian, no diacritics, ZWNJ → space, ASCII digits. */
export function normalizeFoodText(s: string) {
  return asciiDigits(s)
    .toLowerCase()
    .normalize("NFC")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[‌‏‎]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Entry = { key: string; names: string[]; per100: Per100; portionG: number; ref: string };

const ENTRIES: Entry[] = INGREDIENTS.map((i) => ({
  key: i.key,
  names: [...i.fa, ...i.fr, ...i.en].map(normalizeFoodText),
  per100: i.custom ?? usdaPer100(i.usda!) ?? [0, 0, 0, 0, 0, 0, 0],
  portionG: i.portionG,
  ref: i.usda ? `usda:${i.usda}` : `spotifood:${i.key}`,
}));
const BY_KEY = new Map(ENTRIES.map((e) => [e.key, e]));
const RECIPE_ENTRIES = RECIPES.map((r) => ({
  key: r.key,
  names: [...r.fa, ...r.fr, ...r.en].map(normalizeFoodText),
  parts: r.parts.map(([k, g]) => ({ entry: BY_KEY.get(k)!, grams: g })),
}));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PLURAL = "(?:s|es|x|ها|های|ی)?";
const regexCache = new Map<string, RegExp>();
function hasWords(text: string, key: string) {
  let re = regexCache.get(key);
  if (!re) {
    re = new RegExp(`(^|[\\s'’(-])${escape(key)}${PLURAL}(?=$|[\\s,.)'’-])`, "u");
    regexCache.set(key, re);
  }
  return re.test(text);
}

function longest<T extends { names: string[] }>(list: T[], text: string) {
  let best: { item: T; name: string } | null = null;
  for (const item of list)
    for (const name of item.names) {
      if (best && name.length <= best.name.length) continue;
      if (hasWords(text, name)) best = { item, name };
    }
  return best;
}

// English words not in the catalogue: the USDA entry whose description starts with that word
// (e.g. "kiwi" → "Kiwifruit, green, raw"), preferring raw / cooked plain foods.
const USDA_BY_WORD = new Map<string, UsdaRow>();
for (const f of USDA.values()) {
  const head = f[1].toLowerCase().split(/[,(]/)[0]!.trim();
  if (!/^[a-z ]+$/.test(head)) continue;
  const prev = USDA_BY_WORD.get(head);
  const score = (r: UsdaRow) =>
    (/\braw\b/i.test(r[1]) ? 0 : /cooked/i.test(r[1]) ? 1 : 2) * 1000 + r[1].length;
  if (!prev || score(f) < score(prev)) USDA_BY_WORD.set(head, f);
}
function usdaFallback(text: string): Entry | null {
  if (!/^[a-z' -]+$/.test(text)) return null;
  const words = text.replace(/\b\d+\b/g, "").trim();
  for (const w of [words, words.replace(/e?s$/, ""), words.split(" ").at(-1) ?? ""]) {
    const f = w.length > 2 ? USDA_BY_WORD.get(w) : undefined;
    if (f)
      return {
        key: `usda:${f[0]}`,
        names: [w],
        per100: usdaPer100(f[0])!,
        portionG: 50,
        ref: `usda:${f[0]}`,
      };
  }
  return null;
}

const SPLIT = /[,،؛;\n/+•·|]|\s(?:و|et|and|avec|with|با)\s/u;
const GRAMS = /(\d+(?:[.,]\d+)?)\s*(?:g|gr|grs|grammes?|grams?|گرم)(?![\p{L}])/iu;
const COUNT =
  /(?:(\d+)\s*(?:سیخ|عدد|تکه|تا|اسکوپ|x|pcs?|pièces?|pieces?|tranches?|slices?|boules?|scoops?)(?![\p{L}])|(?:^|\s)x\s*(\d+))/iu;

export type DishEstimate = {
  nutrition: Nutrition;
  /** Ingredients counted, with grams and the reference used (usda:<id> or spotifood:<key>). */
  matched: { text: string; grams: number; ref: string }[];
  unknown: string[];
  /** The recipe used when the dish name was recognised. */
  recipe: string | null;
};

export function estimateDish(input: {
  name?: string | null;
  ingredients?: string | null;
  weightGrams?: number | null;
}): DishEstimate {
  const parts = normalizeFoodText(input.ingredients ?? "")
    .split(SPLIT)
    .map((p) => p.trim())
    .filter(Boolean);
  type Found = { text: string; entry: Entry; grams: number; fixed: boolean };
  let found: Found[] = [];
  const unknown: string[] = [];
  for (const part of parts) {
    const entry = longest(ENTRIES, part)?.item ?? usdaFallback(part);
    if (!entry) {
      if (part.length > 1) unknown.push(part);
      continue;
    }
    const g = GRAMS.exec(part);
    const n = COUNT.exec(part);
    const count = n ? Math.min(10, Number(n[1] ?? n[2])) || 1 : 1;
    found.push({
      text: part,
      entry,
      grams: g ? Number(g[1]!.replace(",", ".")) : entry.portionG * count,
      fixed: Boolean(g),
    });
  }

  // The dish name names a known recipe, and the list says little: the recipe is more complete.
  const recipe = longest(RECIPE_ENTRIES, normalizeFoodText(input.name ?? ""))?.item ?? null;
  let used: string | null = null;
  if (recipe && found.length < 2) {
    found = recipe.parts.map((p) => ({
      text: p.entry.names[0]!,
      entry: p.entry,
      grams: p.grams,
      fixed: false,
    }));
    unknown.length = 0;
    used = recipe.key;
  } else if (!found.length) {
    // Last resort: words of the name ("Pizza", "Omelette", "سالاد").
    for (const w of normalizeFoodText(input.name ?? "").split(" ")) {
      const entry = longest(ENTRIES, w)?.item;
      if (entry) found.push({ text: w, entry, grams: entry.portionG, fixed: false });
    }
  }

  const weight = input.weightGrams && input.weightGrams > 0 ? input.weightGrams : null;
  if (weight) {
    const fixed = found.filter((f) => f.fixed).reduce((s, f) => s + f.grams, 0);
    const flexible = found.filter((f) => !f.fixed).reduce((s, f) => s + f.grams, 0);
    if (flexible > 0) {
      const scale = Math.min(4, Math.max(0.25, Math.max(0, weight - fixed) / flexible));
      for (const f of found) if (!f.fixed) f.grams *= scale;
    }
  }

  const sum = [0, 0, 0, 0, 0, 0, 0];
  for (const f of found) f.entry.per100.forEach((v, i) => (sum[i]! += (v * f.grams) / 100));
  return {
    nutrition: found.length
      ? tidy({
          kcal: sum[0],
          proteinG: sum[1],
          carbsG: sum[2],
          sugarG: sum[3],
          fatG: sum[4],
          fiberG: sum[5],
          saltG: sum[6],
        })
      : {},
    matched: found.map((f) => ({ text: f.text, grams: Math.round(f.grams), ref: f.entry.ref })),
    unknown,
    recipe: used,
  };
}

/**
 * What a dish gets automatically: the estimate, brought to the calories the restaurant
 * declared (when it did) — the portion size is what usually differs, not the recipe.
 */
export function autoNutrition(p: {
  name: string;
  ingredients: string | null;
  /** Used as the ingredient list when there is none (menus often list them there). */
  description?: string | null;
  weightGrams: number | null;
  caloriesKcal: number | null;
}): Nutrition | null {
  const e = estimateDish({
    ...p,
    ingredients: p.ingredients?.trim() ? p.ingredients : (p.description ?? null),
  });
  if (!e.matched.length) return p.caloriesKcal != null ? { kcal: p.caloriesKcal } : null;
  if (p.caloriesKcal == null || !e.nutrition.kcal) return e.nutrition;
  const k = Math.min(3, Math.max(0.33, p.caloriesKcal / e.nutrition.kcal));
  const scaled: Nutrition = {};
  for (const [key, v] of Object.entries(e.nutrition)) scaled[key as keyof Nutrition] = (v as number) * k;
  return tidy({ ...scaled, kcal: p.caloriesKcal });
}
