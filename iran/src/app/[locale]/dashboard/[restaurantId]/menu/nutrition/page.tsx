import { CheckCircle2, Database, PenLine, Search, TriangleAlert } from "lucide-react";
import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card, CardHeader } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { menuNutritionCoverage, searchFoods } from "@/server/modules/nutrition/foods";
import { RecalculateButton } from "./recalculate-button";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/menu/nutrition">;

export default function NutritionDatabasePage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
      <NutritionDatabase params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function NutritionDatabase({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "menu.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : "";
  const [t, tn, format, coverage, results] = await Promise.all([
    getTranslations("foodDb"),
    getTranslations("nutrition"),
    getFormatter(),
    menuNutritionCoverage(db, ctx.restaurant.id),
    searchFoods(db, q, 40),
  ]);
  const base = `/dashboard/${ctx.restaurant.id}`;
  const n = (v: number | undefined, d = 1) =>
    v == null ? "—" : format.number(v, { maximumFractionDigits: d });
  const counts = {
    auto: coverage.filter((c) => c.kind === "auto").length,
    manual: coverage.filter((c) => c.kind === "manual").length,
    missing: coverage.filter((c) => c.kind === "missing").length,
  };
  const SOURCE = {
    usda_sr: { label: "USDA", cls: "bg-tone-sky/12 text-tone-sky" },
    spotifood_ingredient: { label: t("ingredient"), cls: "bg-tone-emerald/12 text-tone-emerald" },
    spotifood_recipe: { label: t("recipe"), cls: "bg-accent-soft text-accent-text" },
  } as Record<string, { label: string; cls: string }>;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={can(ctx, "menu.manage") ? <RecalculateButton restaurantId={ctx.restaurant.id} /> : null}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["auto", Database, "text-accent-text"],
            ["manual", PenLine, "text-success"],
            ["missing", TriangleAlert, "text-warning"],
          ] as const
        ).map(([k, Icon, cls]) => (
          <Card key={k} className="flex items-center gap-3 p-4">
            <Icon className={cn("size-6", cls)} aria-hidden="true" />
            <div>
              <p className="text-2xl font-bold tabular-nums">{format.number(counts[k])}</p>
              <p className="text-sm text-fg-muted">{t(`count.${k}`)}</p>
            </div>
          </Card>
        ))}
      </div>

      {counts.missing ? (
        <Card className="mt-5">
          <CardHeader title={t("missingTitle")} description={t("missingHint")} />
          <ul className="flex flex-wrap gap-2 p-5">
            {coverage
              .filter((c) => c.kind === "missing")
              .map((c) => (
                <li key={c.id}>
                  <Link
                    href={`${base}/menu/products/${c.id}`}
                    className="inline-flex rounded-full bg-warning-soft px-3 py-1.5 text-sm font-medium hover:underline"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
      ) : (
        <p className="mt-5 flex items-center gap-2 rounded-2xl bg-success-soft px-4 py-3 text-sm font-semibold text-success">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          {t("allCovered")}
        </p>
      )}

      <Card className="mt-5">
        <CardHeader title={t("searchTitle")} description={t("source")} />
        <form className="flex gap-2 border-b border-border p-4" role="search">
          <label className="relative flex-1">
            <span className="sr-only">{t("searchTitle")}</span>
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
              aria-hidden="true"
            />
            <input
              name="q"
              defaultValue={q}
              placeholder={t("searchPlaceholder")}
              className="h-11 w-full rounded-xl border border-border-strong bg-surface ps-9 pe-3 text-sm"
            />
          </label>
          <button
            type="submit"
            className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg"
          >
            {t("search")}
          </button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-2/60 text-xs text-fg-muted">
              <tr>
                <th className="px-4 py-2 text-start font-semibold">{t("food")}</th>
                <th className="px-2 py-2 text-end font-semibold">{tn("short.kcal")}</th>
                {(["proteinG", "carbsG", "sugarG", "fatG", "fiberG", "saltG"] as const).map((k) => (
                  <th key={k} className="px-2 py-2 text-end font-semibold">
                    {tn(`short.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.map((f) => {
                const v = f.isRecipe ? (f.perPortion ?? f.per100g) : f.per100g;
                const src = SOURCE[f.source];
                return (
                  <tr key={f.id} className="align-top">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold">{f.nameFa ?? f.nameFr ?? f.nameEn}</p>
                      <p className="text-xs text-fg-muted" dir="ltr">
                        {[f.nameFr, f.nameEn].filter(Boolean).join(" · ")}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {src ? (
                          <span className={cn("rounded-full px-2 py-0.5 font-bold", src.cls)}>
                            {src.label}
                          </span>
                        ) : null}
                        <span className="text-fg-muted">
                          {f.isRecipe ? t("perPortion", { g: n(f.portionG ?? 0, 0) }) : t("per100")}
                        </span>
                      </p>
                    </td>
                    <td className="px-2 py-2.5 text-end font-bold tabular-nums">{n(v.kcal, 0)}</td>
                    {(["proteinG", "carbsG", "sugarG", "fatG", "fiberG", "saltG"] as const).map((k) => (
                      <td key={k} className="px-2 py-2.5 text-end tabular-nums">
                        {n(v[k], k === "saltG" ? 2 : 1)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {!results.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-fg-muted">
                    {t("noResult")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
