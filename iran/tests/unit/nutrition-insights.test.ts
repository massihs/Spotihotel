import { describe, expect, it } from "vitest";
import { REFERENCE_INTAKE } from "@/lib/nutrition";
import { dayInsights, energySplit, streak } from "@/lib/nutrition-insights";

const day = (o: Partial<typeof REFERENCE_INTAKE>) => ({
  kcal: 0,
  proteinG: 0,
  carbsG: 0,
  sugarG: 0,
  fatG: 0,
  fiberG: 0,
  saltG: 0,
  ...o,
});

describe("nutrition insights", () => {
  it("puts warnings first and keeps three", () => {
    const list = dayInsights(
      day({ kcal: 2600, saltG: 9, sugarG: 120, proteinG: 60, fiberG: 5 }),
      REFERENCE_INTAKE,
      { meals: 3, unknownPortions: 1, isToday: false },
    );
    expect(list.map((i) => i.code)).toEqual(["salt_high", "sugar_high", "kcal_over"]);
    expect(list[0]?.values).toEqual({ n: 9, goal: 6 });
  });

  it("does not call a day low on fibre after a single meal, today", () => {
    const one = dayInsights(day({ kcal: 600, fiberG: 2 }), REFERENCE_INTAKE, {
      meals: 1,
      unknownPortions: 0,
      isToday: true,
    });
    expect(one.find((i) => i.code === "fiber_low")).toBeUndefined();
    expect(dayInsights(day({}), REFERENCE_INTAKE, { meals: 0, unknownPortions: 0, isToday: true })).toEqual(
      [],
    );
  });

  it("splits energy and counts streaks", () => {
    expect(energySplit({ proteinG: 25, carbsG: 50, fatG: 0 })).toEqual({ protein: 33, carbs: 67, fat: 0 });
    expect(energySplit({ proteinG: 0, carbsG: 0, fatG: 0 })).toBeNull();
    expect(streak([{ meals: 1 }, { meals: 0 }, { meals: 2 }, { meals: 1 }])).toBe(2);
  });
});
