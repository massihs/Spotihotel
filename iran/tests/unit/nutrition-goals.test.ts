import { describe, expect, it } from "vitest";
import { dailyNeeds } from "@/lib/nutrition-goals";

describe("daily needs (Mifflin-St Jeor)", () => {
  it("matches the equation for a woman and a man", () => {
    const f = dailyNeeds({
      sex: "female",
      age: 30,
      weightKg: 60,
      heightCm: 165,
      activity: "light",
      goal: "maintain",
    });
    expect(f.bmr).toBe(1320);
    expect(f.goals.kcal).toBe(1820);
    expect(f.goals.proteinG).toBe(72);
    const m = dailyNeeds({
      sex: "male",
      age: 30,
      weightKg: 80,
      heightCm: 180,
      activity: "moderate",
      goal: "maintain",
    });
    expect(m.bmr).toBe(1780);
    expect(m.goals.kcal).toBe(2760);
    expect(m.bmi).toBeCloseTo(24.7, 1);
  });

  it("adjusts for the goal but never goes below the resting energy", () => {
    const base = { sex: "male", age: 40, weightKg: 90, heightCm: 175, activity: "sedentary" } as const;
    const keep = dailyNeeds({ ...base, goal: "maintain" }).goals.kcal;
    expect(dailyNeeds({ ...base, goal: "lose" }).goals.kcal).toBeLessThan(keep);
    expect(dailyNeeds({ ...base, goal: "gain" }).goals.kcal).toBeGreaterThan(keep);
    const small = dailyNeeds({
      sex: "female",
      age: 80,
      weightKg: 40,
      heightCm: 145,
      activity: "sedentary",
      goal: "lose",
    });
    expect(small.goals.kcal).toBeGreaterThanOrEqual(1200);
    // Energy shares add up: protein + fat + carbs ≈ calories.
    const g = dailyNeeds({ ...base, goal: "maintain" }).goals;
    expect(g.proteinG * 4 + g.fatG * 9 + g.carbsG * 4).toBeCloseTo(g.kcal, -2);
  });
});
