"use client";

import { Activity as ActivityIcon, Flame, Scale, Target, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  ACTIVITY,
  dailyNeeds,
  GOALS,
  LIMITS,
  type Activity,
  type Sex,
  type WeightGoal,
} from "@/lib/nutrition-goals";
import { saveCalorieTrackingAction } from "@/app/[locale]/account/actions";

type Initial = {
  sex: Sex | null;
  age: number | null;
  weightKg: number | null;
  heightCm: number | null;
  activity: Activity | null;
  goal: WeightGoal | null;
};

const inRange = (v: number, [a, b]: readonly [number, number]) => Number.isFinite(v) && v >= a && v <= b;

/**
 * "Do you want to count your calories?" — then sex, age, weight, height, activity and goal,
 * with the daily needs shown live. `ask`: start with the yes / no question (first visit).
 */
export function CalorieSetup({
  initial,
  ask = true,
  onDone,
}: {
  initial: Initial;
  ask?: boolean;
  onDone?: () => void;
}) {
  const t = useTranslations("calories");
  const tn = useTranslations("nutrition");
  const [step, setStep] = useState<"ask" | "form">(ask ? "ask" : "form");
  const [sex, setSex] = useState<Sex | null>(initial.sex);
  const [age, setAge] = useState(initial.age ? String(initial.age) : "");
  const [weight, setWeight] = useState(initial.weightKg ? String(initial.weightKg) : "");
  const [height, setHeight] = useState(initial.heightCm ? String(initial.heightCm) : "");
  const [activity, setActivity] = useState<Activity>(initial.activity ?? "light");
  const [goal, setGoal] = useState<WeightGoal>(initial.goal ?? "maintain");
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);

  const num = (s: string) =>
    Number(s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(",", "."));
  const valid =
    sex != null &&
    inRange(num(age), LIMITS.age) &&
    inRange(num(weight), LIMITS.weightKg) &&
    inRange(num(height), LIMITS.heightCm);
  const needs = useMemo(
    () =>
      valid
        ? dailyNeeds({
            sex: sex!,
            age: num(age),
            weightKg: num(weight),
            heightCm: num(height),
            activity,
            goal,
          })
        : null,
    [valid, sex, age, weight, height, activity, goal],
  );

  const save = (track: boolean) =>
    start(async () => {
      setError(false);
      const res = await saveCalorieTrackingAction(
        track
          ? {
              track,
              body: {
                sex: sex!,
                age: num(age),
                weightKg: num(weight),
                heightCm: num(height),
                activity,
                goal,
              },
            }
          : { track },
      );
      if (res && !res.ok) setError(true);
      else onDone?.();
    });

  if (step === "ask")
    return (
      <div className="text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-3xl bg-accent-soft text-accent-text">
          <Flame className="size-8" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-xl font-bold">{t("askTitle")}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">{t("askBody")}</p>
        <div className="mx-auto mt-6 grid max-w-sm gap-2">
          <Button size="lg" onClick={() => setStep("form")}>
            {t("yes")}
          </Button>
          <Button size="lg" variant="ghost" disabled={pending} onClick={() => save(false)}>
            {t("no")}
          </Button>
        </div>
      </div>
    );

  const numberField = (
    id: string,
    label: string,
    unit: string,
    value: string,
    set: (v: string) => void,
    range: readonly [number, number],
  ) => {
    const bad = value !== "" && !inRange(num(value), range);
    return (
      <label className="block">
        <span className="text-sm font-semibold">{label}</span>
        <span
          className={cn(
            "mt-1.5 flex h-12 items-center rounded-xl border bg-surface px-3 focus-within:ring-2 focus-within:ring-accent",
            bad ? "border-danger" : "border-border-strong",
          )}
        >
          <input
            id={id}
            inputMode="decimal"
            value={value}
            onChange={(e) => set(e.target.value)}
            className="w-full bg-transparent text-lg font-bold tabular-nums outline-none"
            dir="ltr"
          />
          <span className="text-sm text-fg-muted">{unit}</span>
        </span>
        {bad ? (
          <span className="mt-1 block text-xs text-danger">
            {t("range", { min: range[0], max: range[1] })}
          </span>
        ) : null}
      </label>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold">{t("formTitle")}</h2>
        <p className="mt-1 text-sm text-fg-muted">{t("formBody")}</p>
      </div>

      <fieldset>
        <legend className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <User className="size-4 text-fg-muted" aria-hidden="true" />
          {t("sex")}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {(["female", "male"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sex === s}
              onClick={() => setSex(s)}
              className={cn(
                "h-12 rounded-xl text-sm font-bold ring-1 transition-colors ring-inset",
                sex === s
                  ? "bg-accent text-accent-fg ring-accent"
                  : "bg-surface ring-border-strong hover:bg-surface-2",
              )}
            >
              {t(`sex_${s}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-3 gap-3">
        {numberField("age", t("age"), t("years"), age, setAge, LIMITS.age)}
        {numberField("weight", t("weight"), "kg", weight, setWeight, LIMITS.weightKg)}
        {numberField("height", t("height"), "cm", height, setHeight, LIMITS.heightCm)}
      </div>

      <fieldset>
        <legend className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <ActivityIcon className="size-4 text-fg-muted" aria-hidden="true" />
          {t("activity")}
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(ACTIVITY) as Activity[]).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={activity === a}
              onClick={() => setActivity(a)}
              className={cn(
                "rounded-xl px-3 py-2.5 text-start ring-1 transition-colors ring-inset",
                activity === a ? "bg-accent-soft ring-accent" : "bg-surface ring-border hover:bg-surface-2",
              )}
            >
              <span className="block text-sm font-bold">{t(`act_${a}`)}</span>
              <span className="block text-xs text-fg-muted">{t(`act_${a}_hint`)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Target className="size-4 text-fg-muted" aria-hidden="true" />
          {t("goal")}
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(GOALS) as WeightGoal[]).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={goal === g}
              onClick={() => setGoal(g)}
              className={cn(
                "h-11 rounded-xl text-sm font-bold ring-1 transition-colors ring-inset",
                goal === g
                  ? "bg-accent text-accent-fg ring-accent"
                  : "bg-surface ring-border-strong hover:bg-surface-2",
              )}
            >
              {t(`goal_${g}`)}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Live result */}
      <div
        className={cn(
          "rounded-2xl p-4 transition-opacity",
          needs ? "bg-gradient-to-br from-accent-soft to-surface-2" : "bg-surface-2 opacity-60",
        )}
        aria-live="polite"
      >
        <p className="text-xs font-semibold text-fg-muted">{t("resultTitle")}</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-4xl font-extrabold tabular-nums">
            {needs ? needs.goals.kcal.toLocaleString() : "—"}
          </span>
          <span className="text-sm font-semibold text-fg-muted">{t("kcalPerDay")}</span>
        </p>
        {needs ? (
          <>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6">
              {(["proteinG", "carbsG", "fatG", "fiberG", "sugarG", "saltG"] as const).map((k) => (
                <div key={k} className="rounded-xl bg-surface px-1 py-2">
                  <dt className="text-fg-muted">{tn(`short.${k}`)}</dt>
                  <dd className="text-sm font-bold tabular-nums">{tn("grams", { n: needs.goals[k] })}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-muted">
              <Scale className="size-3.5" aria-hidden="true" />
              {t("details", { bmr: needs.bmr, tdee: needs.tdee, bmi: needs.bmi.toFixed(1) })}
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs text-fg-muted">{t("fillAll")}</p>
        )}
      </div>

      {error ? <p className="text-sm text-danger">{t("error")}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="lg" className="flex-1" disabled={!valid || pending} onClick={() => save(true)}>
          {pending ? "…" : t("save")}
        </Button>
        {ask ? (
          <Button size="lg" variant="ghost" disabled={pending} onClick={() => save(false)}>
            {t("no")}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-fg-muted">{t("disclaimer")}</p>
    </div>
  );
}
