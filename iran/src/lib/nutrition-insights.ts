import type { Nutrition } from "./nutrition";

export type Insight = {
  code:
    | "kcal_on_target"
    | "kcal_over"
    | "protein_reached"
    | "protein_low"
    | "fiber_low"
    | "fiber_reached"
    | "sugar_high"
    | "salt_high"
    | "fat_high"
    | "unknown_dishes";
  tone: "good" | "warn" | "info";
  /** Numbers for the message (already rounded). */
  values: Record<string, number>;
};

/**
 * A few plain-language remarks on the day, most useful first (at most `max`). Only rules that
 * matter for someone eating out: calories, protein, fibre, sugars, salt, fat.
 */
export function dayInsights(
  total: Required<Nutrition>,
  goals: Required<Nutrition>,
  opts: { meals: number; unknownPortions: number; isToday: boolean },
  max = 3,
): Insight[] {
  if (!opts.meals) return [];
  const out: Insight[] = [];
  const pct = (k: keyof Nutrition) => (goals[k] > 0 ? total[k] / goals[k] : 0);
  const r = (n: number) => Math.round(n * 10) / 10;

  if (pct("saltG") > 1)
    out.push({ code: "salt_high", tone: "warn", values: { n: r(total.saltG), goal: goals.saltG } });
  if (pct("sugarG") > 1)
    out.push({ code: "sugar_high", tone: "warn", values: { n: r(total.sugarG), goal: goals.sugarG } });
  if (pct("kcal") > 1.1)
    out.push({ code: "kcal_over", tone: "warn", values: { n: Math.round(total.kcal - goals.kcal) } });
  if (pct("fatG") > 1.1)
    out.push({ code: "fat_high", tone: "warn", values: { n: r(total.fatG), goal: goals.fatG } });
  if (pct("proteinG") >= 1)
    out.push({ code: "protein_reached", tone: "good", values: { n: r(total.proteinG) } });
  if (pct("fiberG") >= 1) out.push({ code: "fiber_reached", tone: "good", values: { n: r(total.fiberG) } });
  if (pct("kcal") >= 0.9 && pct("kcal") <= 1.1)
    out.push({ code: "kcal_on_target", tone: "good", values: {} });
  // "Low" only makes sense once the day is over, or late in a day with several meals.
  if (!opts.isToday || opts.meals >= 2) {
    if (pct("fiberG") < 0.5)
      out.push({ code: "fiber_low", tone: "info", values: { n: r(total.fiberG), goal: goals.fiberG } });
    if (pct("proteinG") < 0.5)
      out.push({ code: "protein_low", tone: "info", values: { n: r(total.proteinG), goal: goals.proteinG } });
  }
  if (opts.unknownPortions)
    out.push({ code: "unknown_dishes", tone: "info", values: { n: opts.unknownPortions } });
  const rank = { warn: 0, good: 1, info: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, max);
}

/** Share of the energy from protein, carbs and fat (4 / 4 / 9 kcal per gram), in percent. */
export function energySplit(n: Pick<Required<Nutrition>, "proteinG" | "carbsG" | "fatG">) {
  const p = n.proteinG * 4;
  const c = n.carbsG * 4;
  const f = n.fatG * 9;
  const sum = p + c + f;
  if (!sum) return null;
  const pp = Math.round((p / sum) * 100);
  const cp = Math.round((c / sum) * 100);
  return { protein: pp, carbs: cp, fat: Math.max(0, 100 - pp - cp) };
}

/** Days in a row with at least one meal, ending at the last day of the list. */
export function streak(days: { meals: number }[]) {
  let n = 0;
  for (let i = days.length - 1; i >= 0 && days[i]!.meals > 0; i--) n++;
  return n;
}
