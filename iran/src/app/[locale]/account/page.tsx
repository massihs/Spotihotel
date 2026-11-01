import { Coffee, Cookie, Flame, Moon, Salad, Settings, Sparkles, Sun, UtensilsCrossed } from "lucide-react";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import {
  DishThumb,
  EnergySplit,
  InsightList,
  LimitTile,
  MacroMiniBar,
  MacroTile,
  Ring,
  TrendChart,
  WeekStrip,
  type Status,
} from "@/components/account/nutrition-ui";
import { CalorieSetup } from "@/components/account/calorie-setup";
import { DinerLogin } from "@/components/account/diner-login";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { edition } from "@/config/edition";
import { cn } from "@/lib/cn";
import {
  MORE_IS_BETTER,
  NUTRIENTS,
  REFERENCE_INTAKE,
  tidy,
  type Nutrient,
  type Nutrition,
} from "@/lib/nutrition";
import { dayInsights, energySplit, streak } from "@/lib/nutrition-insights";
import { getCurrentDiner } from "@/server/auth/diner";
import { bodyProfileOf } from "@/server/modules/diners/service";
import { db } from "@/server/db/client";
import {
  dayJournal,
  isDate,
  localDate,
  rangeTotals,
  shiftDate,
  topDishes,
  type MealPeriod,
} from "@/server/modules/diners/journal";

type Props = PageProps<"/[locale]/account">;

const METRICS = ["kcal", "proteinG", "fiberG", "sugarG", "saltG"] as const;
type Metric = (typeof METRICS)[number];
const PERIODS: { key: MealPeriod; Icon: typeof Sun }[] = [
  { key: "breakfast", Icon: Coffee },
  { key: "lunch", Icon: Sun },
  { key: "snack", Icon: Cookie },
  { key: "dinner", Icon: Moon },
];

export default async function AccountPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <Account searchParams={searchParams} />
    </Suspense>
  );
}

function AccountSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-24 animate-pulse rounded-3xl bg-surface" />
      <div className="h-64 animate-pulse rounded-3xl bg-surface" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl bg-surface" />
        ))}
      </div>
    </div>
  );
}

async function Account({ searchParams }: Pick<Props, "searchParams">) {
  const diner = await getCurrentDiner();
  const t = await getTranslations("account");
  if (!diner)
    return (
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent-text">
            <Salad className="size-7" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{t("loginTitle")}</h1>
          <p className="mt-1.5 text-fg-muted">{t("loginSubtitle")}</p>
        </div>
        <Card className="p-6">
          <DinerLogin sms={edition.edition === "iran" || edition.defaultLocale === "fa"} />
        </Card>
        <p className="mt-4 text-center text-xs text-fg-muted">{t("privacyNote")}</p>
      </div>
    );

  // First visit: ask whether to count calories (and the body profile for the daily needs).
  if (diner.trackCalories == null) {
    const body = bodyProfileOf(diner);
    return (
      <div className="mx-auto max-w-xl">
        <Card className="p-6 sm:p-8">
          <CalorieSetup
            initial={{
              sex: body?.sex ?? null,
              age: body?.age ?? null,
              weightKg: body?.weightKg ?? null,
              heightCm: body?.heightCm ?? null,
              activity: body?.activity ?? null,
              goal: body?.goal ?? null,
            }}
          />
        </Card>
      </div>
    );
  }
  const goalsOn = diner.trackCalories;

  const sp = await searchParams;
  const tz = diner.timezone;
  const today = localDate(new Date(), tz);
  const date = isDate(sp.d) && sp.d <= today ? sp.d : today;
  const period = sp.p === "30" ? 30 : 7;
  const metric: Metric = METRICS.includes(sp.m as Metric) ? (sp.m as Metric) : "kcal";
  // The week strip: seven days around the chosen one, never in the future.
  const weekEnd = [shiftDate(date, 3), today].sort()[0]!;
  const rangeStart = [shiftDate(date, -(period - 1)), shiftDate(weekEnd, -6)].sort()[0]!;
  const [format, tn, day, range, favourites] = await Promise.all([
    getFormatter(),
    getTranslations("nutrition"),
    dayJournal(db, diner, date),
    rangeTotals(db, diner, rangeStart, weekEnd),
    topDishes(db, diner.id, 6),
  ]);

  const goals: Required<Nutrition> = { ...REFERENCE_INTAKE, ...(diner.goals ?? {}) };
  const total = day.total;
  const ratio = (k: Nutrient, v = total[k]) => (goalsOn && goals[k] > 0 ? v / goals[k] : 0);
  const asDate = (d: string) => new Date(`${d}T12:00:00Z`);
  type DateOpts = {
    weekday?: "long" | "short" | "narrow";
    day?: "numeric";
    month?: "long" | "short";
    year?: "numeric";
  };
  const fmt = (d: string, o: DateOpts) => format.dateTime(asDate(d), { ...o, timeZone: "UTC" });
  const n = (v: number, digits = 0) => format.number(v, { maximumFractionDigits: digits });
  const g = (v: number) => tn("grams", { n: n(v, 1) });
  const unit = (k: Nutrient, v: number) => (k === "kcal" ? tn("kcal", { n: n(v) }) : g(v));
  const href = (d: string, o: { p?: number; m?: Metric } = {}) => {
    const q = new URLSearchParams({ d });
    if ((o.p ?? period) === 30) q.set("p", "30");
    if ((o.m ?? metric) !== "kcal") q.set("m", o.m ?? metric);
    return `/account?${q}`;
  };

  const byDate = new Map(range.map((r) => [r.date, r]));
  const week = Array.from({ length: 7 }, (_, i) => shiftDate(weekEnd, i - 6)).map((d) => {
    const r = byDate.get(d);
    return {
      date: d,
      weekday: fmt(d, { weekday: "narrow" }),
      day: fmt(d, { day: "numeric" }),
      ratio: r ? (goalsOn ? ratio("kcal", r.kcal) : r.meals > 0 ? 1 : 0) : 0,
      meals: r?.meals ?? 0,
      selected: d === date,
      today: d === today,
      href: href(d),
      label: `${fmt(d, { weekday: "long", day: "numeric", month: "long" })} · ${tn("kcal", { n: n(r?.kcal ?? 0) })}`,
    };
  });

  // Trend over the period ending on the chosen day.
  const trendDays = range.filter((r) => r.date > shiftDate(date, -period) && r.date <= date);
  const withMeals = trendDays.filter((d) => d.meals > 0);
  const avg = (k: Nutrient) =>
    withMeals.length ? withMeals.reduce((s, d) => s + d[k], 0) / withMeals.length : 0;
  const onTarget = withMeals.filter((d) =>
    metric === "kcal"
      ? d.kcal >= goals.kcal * 0.9 && d.kcal <= goals.kcal * 1.1
      : MORE_IS_BETTER[metric]
        ? d[metric] >= goals[metric]
        : d[metric] <= goals[metric],
  ).length;

  // A nutrient no dish of the day gives is unknown ("—"), not zero.
  const known = new Set(
    day.meals.flatMap((m) => m.items.flatMap((i) => Object.keys(i.nutrition ?? {}))) as Nutrient[],
  );
  const gk = (k: Nutrient, v: number) => (known.has(k) || !day.meals.length ? g(v) : "—");
  const dishes = day.meals.reduce((s, m) => s + m.items.reduce((a, i) => a + i.quantity, 0), 0);
  const split = energySplit(total);
  const insights = dayInsights(total, goals, {
    meals: day.meals.length,
    unknownPortions: day.unknownPortions,
    isToday: date === today,
  })
    .filter((i) => goalsOn || i.code === "unknown_dishes")
    .map((i) => ({ tone: i.tone, text: t(`insight.${i.code}`, i.values) }));

  const limitStatus = (k: "fiberG" | "sugarG" | "saltG"): Status => {
    if (!goalsOn || !day.meals.length || !known.has(k)) return "ok";
    const r = ratio(k);
    if (MORE_IS_BETTER[k]) return r >= 1 ? "good" : date < today && r < 0.5 ? "low" : "ok";
    return r > 1 ? "high" : "good";
  };
  const left = goals.kcal - total.kcal;

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-lg font-bold text-accent-fg">
          {(diner.name ?? diner.email ?? "★").trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
            {diner.name ? t("hello", { name: diner.name }) : t("helloAnon")}
          </h1>
          <p className="text-sm text-fg-muted">
            {date === today ? t("today") : fmt(date, { weekday: "long" })} ·{" "}
            {fmt(date, { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <Link
          href="/account/settings"
          aria-label={t("settings")}
          className="grid size-11 place-items-center rounded-2xl bg-surface text-fg-muted shadow-[var(--shadow-soft)] hover:text-fg"
        >
          <Settings className="size-5" aria-hidden="true" />
        </Link>
      </div>

      <WeekStrip days={week} />

      {!goalsOn ? (
        <Link
          href="/account/settings#calories"
          className="flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-sm hover:opacity-90"
        >
          <Flame className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
          <span className="flex-1">
            <span className="block font-semibold">{t("enableTitle")}</span>
            <span className="block text-fg-muted">{t("enableBody")}</span>
          </span>
        </Link>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-5">
          {/* Hero: calories of the day */}
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent-soft via-surface to-surface p-5 shadow-[var(--shadow-soft)] sm:p-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -end-16 -top-16 size-56 rounded-full bg-accent/10 blur-2xl"
            />
            <div className="relative flex flex-col items-center gap-6 sm:flex-row">
              <Ring
                ratio={goalsOn ? ratio("kcal") : total.kcal > 0 ? 1 : 0}
                size={168}
                stroke={6}
                className={ratio("kcal") > 1.1 ? "stroke-warning" : "stroke-accent"}
              >
                <Flame className="mx-auto size-5 text-accent-text" aria-hidden="true" />
                <span className="block text-4xl font-extrabold tracking-tight tabular-nums">
                  {n(total.kcal)}
                </span>
                <span className="block text-xs text-fg-muted">
                  {goalsOn ? t("ofKcal", { goal: n(goals.kcal) }) : tn("short.kcal")}
                </span>
              </Ring>
              <div className="w-full flex-1 space-y-5">
                <dl
                  className={cn(
                    "grid gap-2 text-center sm:text-start",
                    goalsOn ? "grid-cols-3" : "grid-cols-2",
                  )}
                >
                  {goalsOn ? (
                    <div className="rounded-2xl bg-surface p-3 ring-1 ring-border/60">
                      <dt className="text-xs text-fg-muted">{left >= 0 ? t("remaining") : t("over")}</dt>
                      <dd className={cn("text-xl font-bold tabular-nums", left < 0 && "text-warning")}>
                        {n(Math.abs(left))}
                      </dd>
                    </div>
                  ) : null}
                  <div className="rounded-2xl bg-surface p-3 ring-1 ring-border/60">
                    <dt className="text-xs text-fg-muted">{t("mealsLabel")}</dt>
                    <dd className="text-xl font-bold tabular-nums">{n(day.meals.length)}</dd>
                  </div>
                  <div className="rounded-2xl bg-surface p-3 ring-1 ring-border/60">
                    <dt className="text-xs text-fg-muted">{t("dishesLabel")}</dt>
                    <dd className="text-xl font-bold tabular-nums">{n(dishes)}</dd>
                  </div>
                </dl>
                {split ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold text-fg-muted">{t("energySplit")}</p>
                    <EnergySplit
                      split={split}
                      labels={{
                        protein: tn("short.proteinG"),
                        carbs: tn("short.carbsG"),
                        fat: tn("short.fatG"),
                      }}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-fg-muted">{t("splitEmpty")}</p>
                )}
              </div>
            </div>
          </section>

          {/* Macros */}
          <div className="grid grid-cols-3 gap-3">
            {(["proteinG", "carbsG", "fatG"] as const).map((k) => (
              <MacroTile
                key={k}
                nutrient={k}
                name={tn(`short.${k}`)}
                ratio={ratio(k)}
                value={gk(k, total[k])}
                goal={goalsOn ? g(goals[k]) : null}
              />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["fiberG", "sugarG", "saltG"] as const).map((k) => {
              const s = limitStatus(k);
              return (
                <LimitTile
                  key={k}
                  name={tn(`short.${k}`)}
                  ratio={ratio(k)}
                  value={gk(k, total[k])}
                  goal={goalsOn ? g(goals[k]) : null}
                  status={s}
                  statusLabel={s === "ok" ? "" : t(`status.${s}`)}
                />
              );
            })}
          </div>

          {insights.length ? (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
                <Sparkles className="size-4 text-accent-text" aria-hidden="true" />
                {t("insightsTitle")}
              </h2>
              <InsightList items={insights} />
            </section>
          ) : null}

          {/* Meals of the day, by moment */}
          <section>
            <h2 className="mb-3 text-lg font-bold">{t("meals")}</h2>
            {day.meals.length ? (
              <ol className="relative ms-4 space-y-6 border-s-2 border-dashed border-border ps-7">
                {PERIODS.map(({ key, Icon }) => {
                  const meals = day.meals.filter((m) => m.period === key);
                  if (!meals.length) return null;
                  const kcal = meals.reduce((s, m) => s + m.total.kcal, 0);
                  return (
                    <li key={key} className="relative">
                      <span className="absolute -start-[45px] -top-1 grid size-8 place-items-center rounded-full bg-surface text-accent-text shadow-[var(--shadow-soft)] ring-4 ring-bg">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <div className="mb-2 flex items-baseline justify-between gap-2">
                        <h3 className="font-bold">{t(`period.${key}`)}</h3>
                        <span className="text-sm font-semibold text-fg-muted tabular-nums">
                          {tn("kcal", { n: n(kcal) })}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {meals.map((m) => (
                          <Card key={m.orderId} className="overflow-hidden">
                            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                              <p className="min-w-0 truncate text-sm font-semibold">
                                <bdi>{m.restaurant}</bdi>
                                <span className="ms-2 text-xs font-normal text-fg-muted">
                                  {format.dateTime(m.at, {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    timeZone: tz,
                                  })}
                                </span>
                              </p>
                              <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-text tabular-nums">
                                {tn("kcal", { n: n(m.total.kcal) })}
                              </span>
                            </div>
                            <ul className="divide-y divide-border">
                              {m.items.map((i) => {
                                const portion =
                                  i.nutrition && Object.keys(i.nutrition).length ? i.nutrition : null;
                                const eaten = portion
                                  ? tidy(
                                      Object.fromEntries(
                                        Object.entries(portion).map(([k, v]) => [
                                          k,
                                          (v as number) * i.quantity,
                                        ]),
                                      ) as Nutrition,
                                    )
                                  : null;
                                const row = (
                                  <>
                                    <DishThumb src={i.image} placeholder={i.placeholder} />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-semibold">
                                        {i.quantity > 1 ? (
                                          <span className="me-1 text-accent-text">{n(i.quantity)}×</span>
                                        ) : null}
                                        {i.name}
                                      </span>
                                      {eaten ? (
                                        <span className="mt-1.5 block max-w-40">
                                          <MacroMiniBar
                                            split={energySplit({
                                              proteinG: eaten.proteinG ?? 0,
                                              carbsG: eaten.carbsG ?? 0,
                                              fatG: eaten.fatG ?? 0,
                                            })}
                                          />
                                        </span>
                                      ) : (
                                        <span className="mt-0.5 block text-xs text-fg-muted">
                                          {t("noData")}
                                        </span>
                                      )}
                                    </span>
                                    <span className="shrink-0 text-end text-sm font-bold tabular-nums">
                                      {eaten?.kcal != null ? tn("kcal", { n: n(eaten.kcal) }) : "—"}
                                    </span>
                                  </>
                                );
                                return (
                                  <li key={i.id}>
                                    {eaten ? (
                                      <details className="group">
                                        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-surface-2/60 [&::-webkit-details-marker]:hidden">
                                          {row}
                                        </summary>
                                        <dl className="grid grid-cols-3 gap-2 bg-surface-2/50 px-4 py-3 text-center sm:grid-cols-6">
                                          {NUTRIENTS.filter((k) => k !== "kcal").map((k) => (
                                            <div key={k} className="rounded-xl bg-surface px-1 py-2">
                                              <dt className="text-[11px] text-fg-muted">
                                                {tn(`short.${k}`)}
                                              </dt>
                                              <dd className="text-sm font-bold tabular-nums">
                                                {eaten[k] != null ? g(eaten[k]) : "—"}
                                              </dd>
                                            </div>
                                          ))}
                                        </dl>
                                      </details>
                                    ) : (
                                      <div className="flex items-center gap-3 px-4 py-3">{row}</div>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </Card>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <Card className="px-5 py-12 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-2">
                  <UtensilsCrossed className="size-7 text-fg-muted" aria-hidden="true" />
                </span>
                <p className="mt-4 font-semibold">{t("noMeals")}</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">{t("noMealsHint")}</p>
                <Link
                  href="/restaurants"
                  className="mt-5 inline-flex h-10 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg"
                >
                  {t("findRestaurant")}
                </Link>
              </Card>
            )}
          </section>
        </div>

        {/* Side: trend and favourites */}
        <div className="space-y-5 lg:sticky lg:top-6">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold">{t("trend")}</h2>
              <div className="flex gap-1 rounded-full bg-surface-2 p-1 text-xs font-semibold">
                {([7, 30] as const).map((p) => (
                  <Link
                    key={p}
                    href={href(date, { p })}
                    className={cn(
                      "rounded-full px-3 py-1",
                      period === p ? "bg-surface shadow-[var(--shadow-soft)]" : "text-fg-muted",
                    )}
                  >
                    {t("days", { n: p })}
                  </Link>
                ))}
              </div>
            </div>
            <div className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
              {METRICS.map((m) => (
                <Link
                  key={m}
                  href={href(date, { m })}
                  role="tab"
                  aria-selected={metric === m}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset",
                    metric === m
                      ? "bg-accent text-accent-fg ring-accent"
                      : "text-fg-muted ring-border hover:text-fg",
                  )}
                >
                  {tn(`short.${m}`)}
                </Link>
              ))}
            </div>
            <div className="mt-5">
              <TrendChart
                goal={goalsOn ? goals[metric] : null}
                average={avg(metric)}
                goalLabel={t("goal", { n: metric === "kcal" ? n(goals.kcal) : g(goals[metric]) })}
                averageLabel={t("avgShort", { n: metric === "kcal" ? n(avg(metric)) : g(avg(metric)) })}
                caption={tn(`short.${metric}`)}
                days={trendDays.map((d) => ({
                  date: d.date,
                  label: fmt(d.date, { weekday: "long", day: "numeric", month: "long" }),
                  short: fmt(d.date, { day: "numeric" }),
                  value: Math.round(d[metric] * 10) / 10,
                  tooltip: `${fmt(d.date, { weekday: "long", day: "numeric", month: "long" })} · ${unit(metric, d[metric])}`,
                  href: href(d.date),
                  active: d.date === date,
                }))}
              />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-surface-2 p-2.5">
                <dt className="text-[11px] text-fg-muted">{t("average")}</dt>
                <dd className="text-sm font-bold tabular-nums">{unit(metric, avg(metric))}</dd>
              </div>
              <div className="rounded-2xl bg-surface-2 p-2.5">
                <dt className="text-[11px] text-fg-muted">{t("onTarget")}</dt>
                <dd className="text-sm font-bold tabular-nums">
                  {n(onTarget)}/{n(withMeals.length)}
                </dd>
              </div>
              <div className="rounded-2xl bg-surface-2 p-2.5">
                <dt className="text-[11px] text-fg-muted">{t("streak")}</dt>
                <dd className="text-sm font-bold tabular-nums">{t("daysShort", { n: streak(trendDays) })}</dd>
              </div>
            </dl>
          </Card>

          {favourites.length ? (
            <Card className="p-5">
              <h2 className="font-bold">{t("favourites")}</h2>
              <ul className="mt-3 space-y-3">
                {favourites.map((f, i) => (
                  <li key={f.name} className="flex items-center gap-3">
                    <span className="w-4 text-center text-xs font-bold text-fg-muted tabular-nums">
                      {n(i + 1)}
                    </span>
                    <DishThumb src={f.image} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{f.name}</span>
                      <span className="block text-xs text-fg-muted">
                        {t("times", { n: f.count })}
                        {f.kcal != null ? ` · ${tn("kcal", { n: n(f.kcal) })}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <p className="px-2 text-center text-xs text-fg-muted">{t("disclaimer")}</p>
        </div>
      </div>
    </div>
  );
}
