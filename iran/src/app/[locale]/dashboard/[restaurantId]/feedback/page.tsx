import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Star } from "lucide-react";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { UNHAPPY_MAX, getFeedbackOverview, getFeedbackSettings } from "@/server/modules/feedback/service";
import { FeedbackSettingsForm } from "./settings-form";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/feedback">;

export default function FeedbackDashboardPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-60 animate-pulse rounded-2xl bg-surface-2" />}>
      <FeedbackDashboard {...props} />
    </Suspense>
  );
}

async function FeedbackDashboard({ params }: Props) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "customers.view");
  const [t, format, overview, settings] = await Promise.all([
    getTranslations("feedback"),
    getFormatter(),
    getFeedbackOverview(db, ctx),
    getFeedbackSettings(db, ctx),
  ]);
  const tz = ctx.restaurant.timezone;
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("average")}
          value={
            overview.average != null
              ? t("stars", { count: format.number(overview.average, { maximumFractionDigits: 1 }) })
              : "—"
          }
        />
        <StatCard label={t("answered")} value={format.number(overview.answered)} />
        <StatCard
          label={t("rate")}
          value={
            overview.sent ? `${format.number(Math.round((overview.answered / overview.sent) * 100))} %` : "—"
          }
        />
        <StatCard label={t("unhappy")} value={format.number(overview.unhappy)} />
      </div>
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Card>
          <CardHeader title={t("latest")} description={t("latestHint")} />
          {overview.list.length === 0 ? (
            <p className="px-5 py-5 text-sm text-fg-muted sm:px-6">{t("empty")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {overview.list.map((f) => (
                <li
                  key={f.id}
                  className={cn(
                    "px-5 py-3 text-sm sm:px-6",
                    (f.rating ?? 5) <= UNHAPPY_MAX && "bg-danger-soft/40",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className="flex items-center gap-0.5"
                      aria-label={t("stars", { count: f.rating ?? 0 })}
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={cn(
                            "size-4",
                            n <= (f.rating ?? 0) ? "fill-warning text-warning" : "text-border-strong",
                          )}
                          aria-hidden="true"
                        />
                      ))}
                    </span>
                    <span className="text-xs text-fg-muted">
                      #{f.orderNumber} ·{" "}
                      {f.answeredAt
                        ? format.dateTime(f.answeredAt, {
                            dateStyle: "short",
                            timeStyle: "short",
                            timeZone: tz,
                          })
                        : ""}
                    </span>
                  </div>
                  {f.comment ? <p className="mt-1.5">{f.comment}</p> : null}
                  <p className="mt-1 text-xs text-fg-muted" dir="ltr">
                    {f.phone}
                    {f.prizeLabel ? ` · 🎁 ${f.prizeLabel}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title={t("settingsTitle")} />
          <div className="p-5">
            <FeedbackSettingsForm
              restaurantId={ctx.restaurant.id}
              currency={ctx.restaurant.currency}
              disabled={!can(ctx, "restaurant.manage")}
              values={settings}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
