import { Clock, Radio, Sparkles } from "lucide-react";
import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { PlaylistPlayer, RadioPlayer } from "@/components/music/players";
import { CancelRequestButton, SubscribeForm } from "@/components/music/subscribe";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getMusicState } from "@/server/modules/music/service";
import { can } from "@/server/tenancy";

type Params = PageProps<"/[locale]/dashboard/[restaurantId]/music">["params"];

export default function MusicPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-surface-2" />}>
      <MusicContent params={params} />
    </Suspense>
  );
}

async function MusicContent({ params }: { params: Params }) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "restaurant.view");
  const [t, format, locale, state] = await Promise.all([
    getTranslations("music"),
    getFormatter(),
    getLocale(),
    getMusicState(db, ctx),
  ]);
  const prices = {
    weekly: formatMoney(state.prices.weekly, state.currency, locale),
    monthly: formatMoney(state.prices.monthly, state.currency, locale),
  };
  const sub = state.subscription;
  const radioTheme = state.theme?.radioEnabled ? state.theme : state.themes.find((x) => x.radioEnabled);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      {sub?.status === "active" && state.playlist && state.theme ? (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            {state.playlist.tracks.length ? (
              <PlaylistPlayer
                restaurantId={ctx.restaurant.id}
                tracks={state.playlist.tracks}
                color={state.theme.color}
                title={state.theme.name}
                subtitle={t(sub.plan === "weekly" ? "playlistOfWeek" : "playlistOfMonth")}
              />
            ) : (
              <Card className="px-6 py-12 text-center text-fg-muted">{t("emptyTheme")}</Card>
            )}
          </div>
          <div className="space-y-4">
            <Card className="p-5">
              <p className="flex items-center gap-2 font-semibold">
                <Sparkles className="size-5 text-accent" aria-hidden="true" />
                {t(`plans.${sub.plan}.name`)}
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">{t("theme")}</dt>
                  <dd className="font-medium">{state.theme.name}</dd>
                </div>
                {sub.endsAt ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-muted">{t("validUntil")}</dt>
                    <dd className="font-medium">{format.dateTime(sub.endsAt, { dateStyle: "long" })}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">{t("nextPlaylist")}</dt>
                  <dd className="flex items-center gap-1 font-medium">
                    <Clock className="size-3.5" aria-hidden="true" />
                    {state.playlist.nextChangeAt
                      ? format.dateTime(state.playlist.nextChangeAt, {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })
                      : t("nextMonth")}
                  </dd>
                </div>
              </dl>
            </Card>
            {can(ctx, "restaurant.manage") && state.themes.length > 1 ? (
              <details className="group rounded-2xl border border-border bg-surface p-5">
                <summary className="cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden">
                  {t("changeTheme")}
                </summary>
                <div className="mt-4">
                  <SubscribeForm
                    restaurantId={ctx.restaurant.id}
                    themes={state.themes}
                    prices={prices}
                    defaultPlan={sub.plan}
                    defaultTheme={sub.themeId}
                    canManage
                  />
                </div>
              </details>
            ) : null}
            {radioTheme ? (
              <RadioPlayer slug={radioTheme.slug} name={radioTheme.name} color={radioTheme.color} />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {sub?.status === "pending" ? (
            <Card className="flex flex-wrap items-center gap-4 border-warning/40 bg-warning-soft/60 p-5">
              <span className="grid size-12 place-items-center rounded-2xl bg-warning text-white">
                <Clock className="size-6" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t("pendingTitle")}</p>
                <p className="text-sm text-fg-muted">
                  {t("pendingBody", { plan: t(`plans.${sub.plan}.name`), theme: state.theme?.name ?? "" })}
                </p>
              </div>
              {can(ctx, "restaurant.manage") ? (
                <CancelRequestButton restaurantId={ctx.restaurant.id} />
              ) : null}
            </Card>
          ) : (
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent to-[#0b3b24] p-6 text-white sm:p-8">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -end-16 -top-16 size-64 rounded-full bg-white/10 blur-2xl"
              />
              <p className="relative text-2xl font-bold tracking-tight sm:text-3xl">{t("heroTitle")}</p>
              <p className="relative mt-2 max-w-xl opacity-85">{t("heroBody")}</p>
            </div>
          )}
          <SubscribeForm
            restaurantId={ctx.restaurant.id}
            themes={state.themes}
            prices={prices}
            defaultPlan={sub?.plan}
            defaultTheme={sub?.themeId}
            canManage={can(ctx, "restaurant.manage")}
          />
          {radioTheme ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <RadioPlayer slug={radioTheme.slug} name={radioTheme.name} color={radioTheme.color} />
              <Card className="flex flex-col justify-center gap-2 p-6">
                <Radio className="size-6 text-accent" aria-hidden="true" />
                <p className="text-lg font-semibold">{t("radioPromoTitle")}</p>
                <p className="text-sm text-fg-muted">{t("radioPromoBody")}</p>
                <Link href="/radio" className="mt-2 text-sm font-semibold text-accent-text hover:underline">
                  {t("allStations")}
                </Link>
              </Card>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
