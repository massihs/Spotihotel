import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { DayBars, lastDays } from "@/components/dashboard/day-bars";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { requireSuperAdmin } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getAudience } from "@/server/modules/ops/audience";

export default function AdminAudiencePage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Audience />
    </Suspense>
  );
}

async function Audience() {
  await requireSuperAdmin();
  const [t, format, locale, a] = await Promise.all([
    getTranslations("admin.audience"),
    getFormatter(),
    getLocale(),
    getAudience(db, 30),
  ]);
  const n = (v: number) => format.number(v);
  const mobile = a.devices.find((d) => d.device === "mobile")?.views ?? 0;
  const list = (rows: { key: string; views: number }[], empty: string) =>
    rows.length === 0 ? (
      <p className="px-5 py-4 text-sm text-fg-muted">{empty}</p>
    ) : (
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.key} className="flex justify-between gap-3 px-5 py-2.5 text-sm">
            <span className="truncate" dir="ltr">
              {r.key}
            </span>
            <span className="font-semibold tabular-nums">{n(r.views)}</span>
          </li>
        ))}
      </ul>
    );
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("views")} value={n(a.views)} />
        <StatCard label={t("visitors")} value={n(a.visitors)} hint={t("visitorsHint")} />
        <StatCard
          label={t("mobile")}
          value={a.views ? `${n(Math.round((mobile / a.views) * 100))} %` : "—"}
        />
      </div>
      <Card className="mt-6">
        <CardHeader title={t("perDay")} />
        <div className="p-5">
          <DayBars
            data={lastDays(a.byDay, 30, (r) => r.views)}
            label={(v) => t("viewsN", { count: v })}
            locale={locale}
          />
        </div>
      </Card>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("pages")} />
          {list(
            a.pages.map((p) => ({ key: p.path, views: p.views })),
            t("empty"),
          )}
        </Card>
        <Card>
          <CardHeader title={t("referrers")} description={t("referrersHint")} />
          {list(
            a.referrers.map((r) => ({ key: r.referrer ?? "—", views: r.views })),
            t("noReferrer"),
          )}
        </Card>
      </div>
    </>
  );
}
