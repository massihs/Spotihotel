import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Crown, Settings2, Users } from "lucide-react";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card } from "@/components/ui/card";
import { DeskActions, DeskTable, DeskTabs, PeriodForm } from "@/components/pms/desk-table";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { getMoney } from "@/lib/money-server";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { isDay } from "@/server/modules/pms/calc";
import { DESK_TABLES, deskPeriod, roomRack, type Cell } from "@/server/modules/pms/desk-reports";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/reservation">;
const TABS = ["list", "rack", "cancelled", "noshow", "guaranteed", "settings"] as const;
type Tab = (typeof TABS)[number];
const TABLE: Partial<Record<Tab, keyof typeof DESK_TABLES>> = {
  list: "reservationList",
  cancelled: "cancellations",
  noshow: "noShows",
  guaranteed: "guaranteedNoShows",
};

export default function ReservationPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-60 animate-pulse rounded-2xl bg-surface-2" />}>
      <Reservation {...props} />
    </Suspense>
  );
}

/** رزرواسیون: the bookings desk (list, rack, cancellations, no-shows) with print and CSV. */
async function Reservation({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  const rid = ctx.restaurant.id;
  const tab: Tab = (TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as Tab) : "list";
  const t = await getTranslations("deskReports");
  const base = `/dashboard/${rid}/reservation`;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const def = await deskPeriod(db, ctx, tab === "list" ? 0 : 30, tab === "list" ? 30 : 0);
  const from = isDay(str(sp.from)) ? str(sp.from) : def.from;
  const to = isDay(str(sp.to)) ? str(sp.to) : def.to;
  const q = str(sp.q);
  const status = str(sp.status) || "active";
  const key = TABLE[tab];
  const stayLink = (row: Record<string, Cell>) => (row.id ? `/dashboard/${rid}/stays/${row.id}` : null);
  const tStatus = await getTranslations("pms.status");

  const csv = key
    ? `${base.replace("/reservation", "/desk-export")}?report=${key}&from=${from}&to=${to}&q=${encodeURIComponent(q)}${tab === "list" && status !== "active" ? `&status=${status}` : ""}`
    : undefined;

  return (
    <>
      <PageHeader
        title={t("reservation.title")}
        description={t("reservation.subtitle")}
        actions={tab === "settings" ? null : <DeskActions csv={csv} />}
      />
      <DeskTabs base={base} tabs={TABS} current={tab} ns="deskReports.reservation" />
      {key ? (
        <>
          <PeriodForm
            base={base}
            tab={tab}
            from={from}
            to={to}
            q={q}
            search
            choice={
              tab === "list"
                ? {
                    name: "status",
                    value: status,
                    options: [
                      { value: "active", label: t("choice.active") },
                      ...["tentative", "confirmed", "in_house"].map((s) => ({
                        value: s,
                        label: tStatus(s as "confirmed"),
                      })),
                    ],
                  }
                : undefined
            }
          />
          <DeskTable
            table={await DESK_TABLES[key](db, ctx, {
              from,
              to,
              q,
              status: status === "active" ? undefined : status,
            })}
            currency={ctx.restaurant.currency}
            limit={sp.all ? 100_000 : 400}
            allHref={`${base}?tab=${tab}&from=${from}&to=${to}&q=${encodeURIComponent(q)}&status=${status}&all=1`}
            links={{ number: stayLink }}
            empty={t(`reservation.empty.${tab}`)}
          />
        </>
      ) : tab === "rack" ? (
        <Rack rid={rid} ctx={ctx} />
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {(
            [
              ["settings", "/hotel?tab=settings", <Settings2 key="s" />],
              ["plans", "/hotel?tab=plans", <Crown key="p" />],
              ["accounts", "/hotel?tab=accounts", <Users key="a" />],
            ] as const
          ).map(([k, href, icon]) => (
            <Link
              key={k}
              href={`/dashboard/${rid}${href}`}
              className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)] hover:border-border-strong"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text [&_svg]:size-5">
                {icon}
              </span>
              <span>
                <b className="block">{t(`reservation.links.${k}`)}</b>
                <span className="text-sm text-fg-muted">{t(`reservation.links.${k}Hint`)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

const STATE_CLS: Record<string, string> = {
  occupied: "bg-brand-700 text-white ring-brand-700",
  departing: "bg-warning-soft text-fg ring-warning/40",
  arriving: "bg-accent-soft text-fg ring-accent/40",
  vacant: "bg-success-soft text-fg ring-success/30",
  dirty: "bg-surface-2 text-fg ring-border",
  out_of_order:
    "bg-surface-3 text-fg-muted ring-border [background-image:repeating-linear-gradient(135deg,transparent_0_6px,rgb(0_0_0/0.04)_6px_12px)]",
};

/** رک رزرواسیون: the rooms floor by floor, today. */
async function Rack({ rid, ctx }: { rid: string; ctx: Awaited<ReturnType<typeof requireRestaurant>> }) {
  const [rack, t, money] = await Promise.all([
    roomRack(db, ctx),
    getTranslations("deskReports.rack"),
    getMoney(ctx.restaurant.currency),
  ]);
  const floors = [...new Set(rack.rooms.map((r) => r.floor))];
  const states = ["occupied", "departing", "arriving", "vacant", "dirty", "out_of_order"] as const;
  const counts: Record<string, number> = {
    occupied: rack.counts.occupied,
    departing: rack.counts.departing,
    arriving: rack.counts.arriving,
    vacant: rack.counts.vacant,
    dirty: rack.counts.dirty,
    out_of_order: rack.counts.outOfOrder,
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {states.map((s) => (
          <span
            key={s}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ring-1",
              STATE_CLS[s],
            )}
          >
            {t(`state.${s}`)}
            <b className="tabular-nums">{counts[s]}</b>
          </span>
        ))}
      </div>
      {floors.map((f) => (
        <section key={f}>
          <h3 className="mb-2 text-sm font-semibold text-fg-muted">
            {/^\d+$/.test(f) ? t("floor", { n: Number(f) }) : f}
          </h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2">
            {rack.rooms
              .filter((r) => r.floor === f)
              .map((r) => {
                const who = r.stay ?? r.arrival;
                const body = (
                  <>
                    <span className="flex items-baseline justify-between gap-1">
                      <b className="text-lg tabular-nums">{r.label}</b>
                      <small className="opacity-70">{r.type}</small>
                    </span>
                    <span className="truncate text-xs font-semibold">
                      {who ? `${who.vip ? "★ " : ""}${who.guest}` : t(`state.${r.state}`)}
                    </span>
                    <span className="flex justify-between text-[11px] opacity-80">
                      <span>{who ? t("pax", { n: who.pax }) : ""}</span>
                      <span className="tabular-nums">
                        {r.stay && r.stay.balance > 0 ? money(r.stay.balance) : ""}
                      </span>
                    </span>
                  </>
                );
                const cls = cn(
                  "flex min-h-[86px] flex-col justify-between gap-1 rounded-xl p-2.5 ring-1",
                  STATE_CLS[r.state],
                );
                return who ? (
                  <Link
                    key={r.id}
                    href={`/dashboard/${rid}/stays/${who.id}`}
                    className={cn(cls, "transition hover:brightness-95")}
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={r.id} className={cls}>
                    {body}
                  </div>
                );
              })}
          </div>
        </section>
      ))}
      {!rack.rooms.length ? (
        <Card className="p-10 text-center text-sm text-fg-muted">{t("noRooms")}</Card>
      ) : null}
    </div>
  );
}
