"use client";

import { Database, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import type { Nutrition } from "@/lib/nutrition";
import { estimateDishAction } from "../../actions";

const GRAM_FIELDS = ["proteinG", "carbsG", "sugarG", "fatG", "fiberG", "saltG"] as const;

type Estimate = {
  nutrition: Nutrition;
  matched: { text: string; grams: number; ref: string }[];
  unknown: string[];
  recipe: string | null;
};

/**
 * Calories, weight and nutrients of one portion. Left as is, they are calculated automatically
 * from the food database (ingredients, or the recipe of a known dish); "Calculate now" shows the
 * result; any value typed by hand is kept as entered.
 */
export function NutritionFields({
  restaurantId,
  values,
  errors,
}: {
  restaurantId: string;
  values: {
    caloriesKcal: number | null;
    weightGrams: number | null;
    nutrition: Nutrition | null;
    nutritionSource: string | null;
  };
  errors: { caloriesKcal?: string; weightGrams?: string; nutrition?: string };
}) {
  const t = useTranslations("product");
  const tn = useTranslations("nutrition");
  const box = useRef<HTMLDivElement>(null);
  const hasMacros = values.nutrition?.proteinG != null || values.nutrition?.carbsG != null;
  const [source, setSource] = useState(hasMacros ? (values.nutritionSource ?? "manual") : "auto");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [empty, setEmpty] = useState(false);
  const [pending, start] = useTransition();

  const input = (name: string) =>
    box.current?.closest("form")?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);

  const run = () =>
    start(async () => {
      const weight = Number(input("weightGrams")?.value) || null;
      const res = await estimateDishAction(restaurantId, {
        name: input("name")?.value ?? "",
        ingredients: input("ingredients")?.value ?? "",
        description: input("description")?.value ?? "",
        weightGrams: weight,
      });
      if (!res?.ok || !res.data) return;
      const e = res.data as Estimate;
      setEstimate(e);
      setEmpty(!e.matched.length);
      if (!e.matched.length) return;
      const set = (name: string, v: number | undefined) => {
        const el = input(name);
        if (el && v != null) el.value = String(v);
      };
      if (!input("caloriesKcal")?.value) set("caloriesKcal", e.nutrition.kcal);
      for (const k of GRAM_FIELDS) set(k, e.nutrition[k]);
      setSource("estimated");
    });

  return (
    <div
      ref={box}
      className="space-y-4"
      onInput={(e) => {
        // Typing a nutrient fixes the values; calories and weight keep the automatic calculation.
        const name = (e.target as HTMLInputElement).name;
        if ((GRAM_FIELDS as readonly string[]).includes(name)) setSource("manual");
      }}
    >
      <input type="hidden" name="nutritionSource" value={source} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3">
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">{t("nutritionTitle")}</p>
          <p className="text-fg-muted">{t("nutritionHint")}</p>
        </div>
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={run}>
          <Sparkles className="size-4" aria-hidden="true" />
          {pending ? "…" : t("estimate")}
        </Button>
      </div>
      {source === "auto" ? (
        <p className="flex gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm">
          <Database className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
          {t("autoNotice")}
        </p>
      ) : null}
      {source === "estimated" && estimate ? (
        <div role="status" className="rounded-xl bg-warning-soft px-3 py-2 text-sm">
          <p>{estimate.recipe ? t("estimatedRecipe") : t("estimatedNotice")}</p>
          <p className="mt-1 text-xs text-fg-muted">
            {estimate.matched.map((m) => `${m.text} (${m.grams} g)`).join(" · ")}
          </p>
          {estimate.unknown.length ? (
            <p className="mt-1 text-xs text-fg-muted">
              {t("estimateUnknown", { list: estimate.unknown.slice(0, 6).join("، ") })}
            </p>
          ) : null}
        </div>
      ) : null}
      {empty ? <p className="text-sm text-danger">{t("estimateNothing")}</p> : null}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field
          label={t("calories")}
          name="caloriesKcal"
          type="number"
          min={0}
          inputMode="numeric"
          defaultValue={values.caloriesKcal ?? ""}
          error={errors.caloriesKcal}
        />
        <Field
          label={t("weight")}
          name="weightGrams"
          type="number"
          min={0}
          inputMode="numeric"
          defaultValue={values.weightGrams ?? ""}
          error={errors.weightGrams}
        />
        {GRAM_FIELDS.map((k) => (
          <Field
            key={k}
            label={tn(`field.${k}`)}
            name={k}
            type="number"
            min={0}
            step="0.1"
            inputMode="decimal"
            placeholder={source === "auto" ? t("autoPlaceholder") : undefined}
            defaultValue={values.nutrition?.[k] ?? ""}
          />
        ))}
      </div>
      {errors.nutrition ? <p className="text-sm text-danger">{errors.nutrition}</p> : null}
    </div>
  );
}
