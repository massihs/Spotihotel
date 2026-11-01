import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { IconCheck } from "@/components/ui/icons";
import { PageHeader } from "@/components/dashboard/app-shell";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getSetupOverview } from "@/server/modules/dashboard/service";
import { cn } from "@/lib/cn";
import { Link } from "@/i18n/navigation";

export default function OverviewPage({ params }: PageProps<"/[locale]/dashboard/[restaurantId]">) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: { params: PageProps<"/[locale]/dashboard/[restaurantId]">["params"] }) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId);
  const t = await getTranslations("dashboard");
  const overview = await getSetupOverview(db, ctx);

  const base = `/dashboard/${ctx.restaurant.id}`;
  const steps = [
    { key: "profile", done: overview.profileComplete, href: `${base}/settings` },
    { key: "tables", done: overview.tables > 0, href: `${base}/tables` },
    { key: "menu", done: overview.products > 0, href: `${base}/menu` },
    { key: "payments", done: false, href: null },
  ] as const;

  return (
    <>
      <PageHeader
        title={t("welcome", { name: ctx.user.fullName.split(" ")[0] ?? "" })}
        description={t("overviewSubtitle")}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("stats.tables")} value={overview.tables} />
        <StatCard label={t("stats.categories")} value={overview.categories} />
        <StatCard label={t("stats.products")} value={overview.products} />
        <StatCard label={t("stats.members")} value={overview.members} />
      </div>

      <Card className="mt-6">
        <CardHeader title={t("setupTitle")} description={t("setupSubtitle")} />
        <ol className="divide-y divide-border">
          {steps.map((s, i) => (
            <li key={s.key} className="flex items-center gap-3 px-5 py-3.5">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                  s.done ? "border-success bg-success-soft text-success" : "border-border text-fg-muted",
                )}
                aria-hidden="true"
              >
                {s.done ? (
                  <span className="size-4">
                    <IconCheck />
                  </span>
                ) : (
                  i + 1
                )}
              </span>
              {s.href && !s.done ? (
                <Link href={s.href} className="text-sm font-medium text-accent hover:underline">
                  {t(`setup.${s.key}`)} →
                </Link>
              ) : (
                <span className={cn("text-sm", s.done && "text-fg-muted line-through")}>
                  {t(`setup.${s.key}`)}
                </span>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
