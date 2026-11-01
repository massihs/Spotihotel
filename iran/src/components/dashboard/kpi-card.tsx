import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Target } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db/client";
import { getKpiStatus } from "@/server/modules/kpi/service";
import type { RestaurantContext } from "@/server/tenancy";

/** Today against the restaurant's targets (Settings > Targets). Nothing when no target is set. */
export async function KpiCard({ ctx, canManage }: { ctx: RestaurantContext; canManage: boolean }) {
  const [t, format, locale, k] = await Promise.all([
    getTranslations("kpi"),
    getFormatter(),
    getLocale(),
    getKpiStatus(db, ctx),
  ]);
  const g = k.goals;
  if (!g.dailyRevenueCents && !g.maxPrepMinutes && !g.minRating) return null;
  const money = (c: number) => formatMoney(c, ctx.restaurant.currency, locale);
  const rows: { key: string; label: string; value: string; goal: string; pct: number; ok: boolean }[] = [];
  if (g.dailyRevenueCents) {
    const pct = Math.min(100, Math.round((k.revenueTodayCents / g.dailyRevenueCents) * 100));
    rows.push({
      key: "revenue",
      label: t("revenue"),
      value: money(k.revenueTodayCents),
      goal: money(g.dailyRevenueCents),
      pct,
      ok: pct >= 100,
    });
  }
  if (g.maxPrepMinutes) {
    const m = k.prepTodayMinutes;
    rows.push({
      key: "prep",
      label: t("prep"),
      value: m != null ? t("minutes", { n: format.number(Math.round(m)) }) : "—",
      goal: t("max", { value: t("minutes", { n: format.number(g.maxPrepMinutes) }) }),
      pct: m != null ? Math.min(100, Math.round((m / g.maxPrepMinutes) * 100)) : 0,
      ok: m == null || m <= g.maxPrepMinutes,
    });
  }
  if (g.minRating) {
    const r = k.rating7d;
    rows.push({
      key: "rating",
      label: t("rating"),
      value: r != null ? `${format.number(r, { maximumFractionDigits: 1 })} ★` : "—",
      goal: t("min", { value: `${format.number(g.minRating, { maximumFractionDigits: 1 })} ★` }),
      pct: r != null ? Math.min(100, Math.round((r / 5) * 100)) : 0,
      ok: r == null || r >= g.minRating,
    });
  }
  return (
    <Card className="mt-4">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Target className="size-4 text-accent" aria-hidden="true" />
            {t("title")}
          </span>
        }
        action={
          canManage ? (
            <Link
              href={`/dashboard/${ctx.restaurant.id}/settings#goals`}
              className="text-sm text-fg-muted hover:text-fg"
            >
              {t("edit")}
            </Link>
          ) : undefined
        }
      />
      <ul className="grid gap-4 p-5 sm:grid-cols-3">
        {rows.map((r) => (
          <li key={r.key}>
            <p className="text-sm text-fg-muted">{r.label}</p>
            <p className={cn("mt-1 text-xl font-bold tabular-nums", !r.ok && "text-danger")}>{r.value}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <div
                className={cn("h-full rounded-full", r.ok ? "bg-success" : "bg-danger")}
                style={{ width: `${r.pct}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-fg-subtle">{r.goal}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
