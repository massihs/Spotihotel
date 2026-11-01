import { Music, Radio } from "lucide-react";
import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { NewThemeDialog, SubscriptionActions } from "@/components/music/admin-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { fmtDuration } from "@/lib/duration";
import { formatMoney } from "@/lib/money";
import { requireSuperAdmin } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { listSubscriptionsForAdmin, listThemesForAdmin } from "@/server/modules/music/service";
import { edition } from "@/config/edition";

export default function AdminMusicPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <AdminMusic />
    </Suspense>
  );
}

async function AdminMusic() {
  const admin = await requireSuperAdmin();
  const [t, format, locale, themes, subs] = await Promise.all([
    getTranslations("music"),
    getFormatter(),
    getLocale(),
    listThemesForAdmin(db, admin),
    listSubscriptionsForAdmin(db, admin),
  ]);
  const pending = subs.filter((s) => s.status === "pending").length;

  return (
    <>
      <PageHeader
        title={t("admin.title")}
        description={t("admin.subtitle")}
        actions={
          <>
            <Link
              href="/radio"
              target="_blank"
              className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium ring-1 ring-border hover:bg-surface-2"
            >
              <Radio className="size-4" aria-hidden="true" />
              {t("admin.openRadio")}
            </Link>
            <NewThemeDialog />
          </>
        }
      />

      <section>
        <h2 className="mb-3 text-lg font-semibold">{t("admin.themes")}</h2>
        {themes.length === 0 ? (
          <Card className="px-6 py-12 text-center text-fg-muted">{t("admin.noThemes")}</Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {themes.map((th) => (
              <li key={th.id}>
                <Link href={`/admin/music/${th.id}`} className="block h-full">
                  <Card className="flex h-full items-center gap-4 p-4 transition-colors hover:border-border-strong">
                    <span
                      className="grid size-14 shrink-0 place-items-center rounded-2xl text-white shadow-sm"
                      style={{ background: `linear-gradient(135deg, ${th.color}, ${th.color}aa)` }}
                    >
                      <Music className="size-6" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{th.name}</p>
                      <p className="text-sm text-fg-muted">
                        {t("admin.trackCount", { count: th.trackCount })} ·{" "}
                        <span className="tabular-nums">{fmtDuration(th.totalSec)}</span>
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {!th.isActive ? <Badge>{t("admin.inactive")}</Badge> : null}
                        {th.radioEnabled && th.isActive ? (
                          <Badge tone="accent">{t("admin.radioOn")}</Badge>
                        ) : null}
                        {th.subscribers ? (
                          <Badge tone="success">{t("admin.subscribers", { count: th.subscribers })}</Badge>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card className="mt-8">
        <CardHeader
          title={t("admin.subscriptions")}
          description={t("admin.subscriptionsHint", {
            weekly: formatMoney(edition.musicPrices.weekly, edition.platformCurrency, locale),
            monthly: formatMoney(edition.musicPrices.monthly, edition.platformCurrency, locale),
          })}
          action={
            pending ? <Badge tone="warning">{t("admin.pendingCount", { count: pending })}</Badge> : null
          }
        />
        {subs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-fg-muted">{t("admin.noSubscriptions")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {subs.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.restaurantName}</p>
                  <p className="text-xs text-fg-muted">
                    {t(`plans.${s.plan}.name`)} · {s.themeName} ·{" "}
                    {formatMoney(s.priceCents, edition.platformCurrency, locale)}
                    {s.endsAt && s.status === "active"
                      ? ` · ${t("admin.until", { date: format.dateTime(s.endsAt, { dateStyle: "medium" }) })}`
                      : ""}
                  </p>
                </div>
                <Badge
                  tone={s.status === "active" ? "success" : s.status === "pending" ? "warning" : "neutral"}
                >
                  {t(`status.${s.status}`)}
                </Badge>
                <SubscriptionActions id={s.id} status={s.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
