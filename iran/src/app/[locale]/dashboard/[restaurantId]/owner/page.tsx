import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import {
  BedDouble,
  Eye,
  FileWarning,
  Lock,
  LockOpen,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  UsersRound,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Empty } from "@/components/ui/empty";
import { PeriodForm } from "@/components/pms/desk-table";
import { periodOf } from "@/components/hotel/service-module";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { calendarLocale, formatCalendarDate } from "@/lib/jalali-calendar";
import { getMoney } from "@/lib/money-server";
import { EDITION } from "@/config/edition";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { ownerWatch } from "@/server/modules/owner/watch";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/owner">;

export default function OwnerPage(props: Props) {
  return (
    <Suspense fallback={<div className="skeleton h-80 rounded-2xl" />}>
      <Owner {...props} />
    </Suspense>
  );
}

const KIND_TONE: Record<string, string> = {
  housekeeping: "bg-danger-soft text-danger",
  request: "bg-warning-soft text-warning",
};

/** چشم مالک: rooms used without a stay, staff money signals, unpaid departures, sealed days. */
async function Owner({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "analytics.view");
  const sp = await searchParams;
  const period = await periodOf(ctx, sp, 13);
  const [t, locale, money, w] = await Promise.all([
    getTranslations("owner"),
    getLocale(),
    getMoney(ctx.restaurant.currency),
    ownerWatch(db, ctx, period),
  ]);
  const rid = ctx.restaurant.id;
  const base = `/dashboard/${rid}/owner`;
  const dayFmt = new Intl.DateTimeFormat(calendarLocale(locale, EDITION), {
    day: "numeric",
    month: "short",
    weekday: "short",
    timeZone: "UTC",
  });
  const day = (d: string) => formatCalendarDate(dayFmt, new Date(`${d}T12:00:00Z`));
  const broken = w.seals.filter((s) => s.status === "broken");
  const leak = w.unpaid.reduce((s, u) => s + u.balanceCents, 0);
  const shortage = w.staff.reduce((s, r) => s + r.shortCents, 0);
  const verdict = w.score >= 85 ? "good" : w.score >= 60 ? "watch" : "alert";

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <PeriodForm base={base} tab="" from={period.from} to={period.to} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
        <Card
          className="relative isolate overflow-hidden border-transparent p-6 text-white shadow-accent"
          style={{
            background:
              verdict === "alert"
                ? "linear-gradient(135deg, oklch(0.45 0.16 25), oklch(0.32 0.1 20))"
                : "var(--brand-gradient)",
          }}
        >
          <span
            aria-hidden="true"
            className="texture-khatam texture-fade-corner [--tex-color:white] [--tex-opacity:0.12] [--tex-size:64px]"
          />
          <div className="relative flex items-center gap-5">
            <div
              className="grid size-28 shrink-0 place-items-center rounded-full"
              style={{
                background: `conic-gradient(white ${w.score * 3.6}deg, rgb(255 255 255 / 0.18) 0)`,
              }}
              role="img"
              aria-label={t("scoreAria", { score: w.score })}
            >
              <span className="grid size-[5.6rem] place-items-center rounded-full bg-black/25 backdrop-blur">
                <span className="text-center">
                  <span className="block text-3xl font-black tabular-nums">{w.score}</span>
                  <span className="block text-[11px] text-white/70">/ 100</span>
                </span>
              </span>
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm text-white/75">
                <Eye className="size-4" aria-hidden="true" />
                {t("trust")}
              </p>
              <p className="mt-1 text-xl font-bold">{t(`verdict.${verdict}`)}</p>
              <p className="mt-1 text-sm leading-6 text-white/80">{t(`verdictHint.${verdict}`)}</p>
            </div>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
          <StatCard
            compact
            tone={w.ghostRooms.length ? "rose" : "default"}
            label={t("kpi.ghost")}
            value={w.ghostRooms.length}
            icon={<BedDouble className="size-5" aria-hidden="true" />}
          />
          <StatCard
            compact
            label={t("kpi.unpaid")}
            value={money(leak)}
            hint={t("kpi.unpaidHint", { n: w.unpaid.length })}
            icon={<FileWarning className="size-5" aria-hidden="true" />}
          />
          <StatCard
            compact
            label={t("kpi.shortage")}
            value={money(shortage)}
            icon={<TrendingDown className="size-5" aria-hidden="true" />}
          />
          <StatCard
            compact
            tone={broken.length ? "rose" : "default"}
            label={t("kpi.seals")}
            value={broken.length ? t("kpi.broken", { n: broken.length }) : t("kpi.intact")}
            icon={
              broken.length ? (
                <ShieldAlert className="size-5" aria-hidden="true" />
              ) : (
                <ShieldCheck className="size-5" aria-hidden="true" />
              )
            }
          />
        </div>
      </div>

      {/* Rooms used without a stay */}
      <Card className="mt-6">
        <CardHeader title={t("ghost.title")} count={w.ghostRooms.length} description={t("ghost.hint")} />
        <div className="p-4 sm:p-5">
          {w.ghostRooms.length ? (
            <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {w.ghostRooms.map((g) => (
                <li
                  key={`${g.roomId}-${g.day}`}
                  className="flex items-start gap-3 rounded-2xl border border-danger/25 bg-danger-soft/40 p-3.5"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ink text-base font-black text-ink-fg tabular-nums">
                    {g.room}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{day(g.day)}</p>
                    <p className="mt-0.5 text-xs text-fg-muted">{t("ghost.noStay")}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {g.kinds.map((k) => (
                        <span
                          key={k}
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            KIND_TONE[k] ?? "shade-soft",
                          )}
                        >
                          {t.has(`ghost.kinds.${k}`) ? t(`ghost.kinds.${k}`) : k}
                        </span>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<ShieldCheck aria-hidden="true" />}>{t("ghost.none")}</Empty>
          )}
        </div>
      </Card>

      {/* Staff */}
      <Card className="mt-6 overflow-x-auto">
        <CardHeader title={t("staff.title")} description={t("staff.hint")} />
        {w.staff.length ? (
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="shade-head border-b border-border text-xs text-fg-muted">
              <tr>
                <th className="px-4 py-3 text-start">{t("staff.name")}</th>
                <th className="px-4 py-3 text-end">{t("staff.voids")}</th>
                <th className="px-4 py-3 text-end">{t("staff.discounts")}</th>
                <th className="px-4 py-3 text-end">{t("staff.shortage")}</th>
                <th className="px-4 py-3 text-end">{t("staff.cancellations")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {w.staff.map((s, i) => (
                <tr key={s.userId}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      <Avatar name={s.name} size="sm" />
                      <span className="font-semibold">{s.name}</span>
                      {i === 0 && s.voidCents + s.discountCents + s.shortCents > 0 ? (
                        <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">
                          {t("staff.top")}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {s.voids ? (
                      <>
                        {s.voids} <span className="text-xs text-fg-muted">({money(s.voidCents)})</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {s.discounts ? (
                      <>
                        {s.discounts}{" "}
                        <span className="text-xs text-fg-muted">({money(s.discountCents)})</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-end tabular-nums",
                      s.shortCents > 0 && "font-bold text-danger",
                    )}
                  >
                    {s.shortCents ? money(s.shortCents) : "—"}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">{s.cancellations || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-4 sm:p-5">
            <Empty icon={<UsersRound aria-hidden="true" />}>{t("staff.none")}</Empty>
          </div>
        )}
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("unpaid.title")} description={t("unpaid.hint")} />
          {w.unpaid.length ? (
            <ul className="divide-y divide-border">
              {w.unpaid.map((u) => (
                <li key={u.stayId}>
                  <Link
                    href={`/dashboard/${rid}/stays/${u.stayId}`}
                    className="row-hover flex items-center gap-3 px-5 py-3"
                  >
                    <Avatar name={u.guest} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{u.guest}</span>
                      <span className="block text-xs text-fg-muted">
                        #{u.number} · {day(u.departure)}
                      </span>
                    </span>
                    <span className="font-bold whitespace-nowrap text-danger tabular-nums">
                      {money(u.balanceCents)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 sm:p-5">
              <Empty size="sm" icon={<ShieldCheck aria-hidden="true" />}>
                {t("unpaid.none")}
              </Empty>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title={t("cheap.title")} description={t("cheap.hint")} />
          {w.cheapNights.length ? (
            <ul className="divide-y divide-border">
              {w.cheapNights.map((c) => (
                <li key={`${c.stayId}-${c.day}`}>
                  <Link
                    href={`/dashboard/${rid}/stays/${c.stayId}`}
                    className="row-hover flex items-center gap-3 px-5 py-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{c.guest}</span>
                      <span className="block text-xs text-fg-muted">
                        #{c.number} · {day(c.day)}
                      </span>
                    </span>
                    <span className="text-end text-sm whitespace-nowrap tabular-nums">
                      <span className="block font-bold text-warning">{money(c.chargedCents)}</span>
                      <span className="block text-xs text-fg-muted line-through">{money(c.rateCents)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 sm:p-5">
              <Empty size="sm" icon={<ShieldCheck aria-hidden="true" />}>
                {t("cheap.none")}
              </Empty>
            </div>
          )}
        </Card>
      </div>

      {/* Sealed days */}
      <Card className="mt-6">
        <CardHeader title={t("seals.title")} description={t("seals.hint")} />
        <div className="p-4 sm:p-5">
          {broken.length ? (
            <p className="mb-4 flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t("seals.brokenAlert", { days: broken.map((b) => day(b.day)).join("، ") })}
            </p>
          ) : null}
          {w.seals.length ? (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
              {w.seals.map((s) => (
                <li
                  key={s.day}
                  title={t(`seals.status.${s.status}`)}
                  className={cn(
                    "rounded-xl px-2.5 py-2 text-center text-xs ring-1",
                    s.status === "broken"
                      ? "bg-danger-soft text-danger ring-danger/30"
                      : s.status === "new"
                        ? "shade-soft ring-border"
                        : "bg-success-soft/60 text-success ring-success/20",
                  )}
                >
                  {s.status === "broken" ? (
                    <LockOpen className="mx-auto mb-1 size-4" aria-hidden="true" />
                  ) : (
                    <Lock className="mx-auto mb-1 size-4" aria-hidden="true" />
                  )}
                  <span className="block font-semibold">{day(s.day)}</span>
                  <span className="block text-[10px] tabular-nums opacity-80">
                    {t("seals.lines", { n: s.lines })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty size="sm" icon={<Lock aria-hidden="true" />}>
              {t("seals.none")}
            </Empty>
          )}
        </div>
      </Card>
    </>
  );
}
