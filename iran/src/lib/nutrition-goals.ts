import { tidy, type Nutrition } from "./nutrition";

export const SEXES = ["female", "male"] as const;
export type Sex = (typeof SEXES)[number];

/** Physical activity level (PAL) multipliers on the resting energy. */
export const ACTIVITY = {
  sedentary: 1.2, // desk job, little exercise
  light: 1.375, // 1–3 sessions a week
  moderate: 1.55, // 3–5 sessions a week
  active: 1.725, // hard exercise 6–7 days
  very_active: 1.9, // physical job + training
} as const;
export type Activity = keyof typeof ACTIVITY;

export const GOALS = { lose: -0.15, maintain: 0, gain: 0.1 } as const;
export type WeightGoal = keyof typeof GOALS;

export type BodyProfile = {
  sex: Sex;
  age: number;
  weightKg: number;
  heightCm: number;
  activity: Activity;
  goal: WeightGoal;
};

export const LIMITS = { age: [13, 100], weightKg: [30, 300], heightCm: [120, 230] } as const;

/**
 * Daily energy and nutrient needs of an adult (Mifflin-St Jeor resting energy × activity,
 * ±15 % / +10 % for losing or gaining weight). Protein 1.2 g/kg (WHO/EFSA range for active
 * adults), fat 30 % of energy, free sugars < 10 % (WHO), fibre 14 g per 1000 kcal, salt < 5 g (WHO),
 * carbohydrates the rest.
 */
export function dailyNeeds(p: BodyProfile) {
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === "male" ? 5 : -161);
  const tdee = bmr * ACTIVITY[p.activity];
  // Never advise eating below the resting energy, nor below 1200 / 1500 kcal.
  const floor = Math.max(bmr, p.sex === "male" ? 1500 : 1200);
  const kcal = Math.max(floor, tdee * (1 + GOALS[p.goal]));
  const proteinG = 1.2 * p.weightKg;
  const fatG = (kcal * 0.3) / 9;
  const carbsG = Math.max(0, (kcal - proteinG * 4 - fatG * 9) / 4);
  const goals = tidy({
    kcal: Math.round(kcal / 10) * 10,
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    sugarG: Math.round((kcal * 0.1) / 4),
    fatG: Math.round(fatG),
    fiberG: Math.round((kcal / 1000) * 14),
    saltG: 5,
  }) as Required<Nutrition>;
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), bmi: p.weightKg / (p.heightCm / 100) ** 2, goals };
}
