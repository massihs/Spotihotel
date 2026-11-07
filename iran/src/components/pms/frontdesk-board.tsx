"use client";

import { CheckInButton } from "./check-in-wizard";
import { BedDouble, LogIn, LogOut, MoonStar, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useMoney } from "@/components/ui/use-money";
import { checkOutAction, nightAuditAction } from "@/app/[locale]/dashboard/[restaurantId]/hotel-actions";
import { Empty, RunButton, StatusPill, useDay } from "./kit";

export type DeskStay = {
  id: string;
  number: number;
  status: string;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  roomTypeId: string;
  roomId: string | null;
  roomLabel: string | null;
  typeCode: string;
  firstName: string;
  lastName: string;
  vip: boolean;
  eta: string | null;
  balanceCents: number;
  accountName: string | null;
  precheckinAt?: Date | string | null;
};
export type DeskRoom = {
  id: string;
  label: string;
  roomTypeId: string | null;
  housekeeping: string;
  occupied: boolean;
};

export function FrontDeskBoard({
  restaurantId,
  currency,
  businessDate,
  arrivals,
  departures,
  inHouse,
  rooms: _rooms,
  preflight,
  canManage,
}: {
  restaurantId: string;
  currency: string;
  businessDate: string;
  arrivals: DeskStay[];
  departures: DeskStay[];
  inHouse: DeskStay[];
  rooms: DeskRoom[];
  preflight: { dueOut: number; noShows: number };
  canManage: boolean;
}) {
  const t = useTranslations("pms.desk");
  const money = useMoney(currency);
  const day = useDay();
  const base = `/dashboard/${restaurantId}`;

  const name = (s: DeskStay) => (
    <Link href={`${base}/stays/${s.id}`} className="font-semibold hover:underline">
      {s.vip ? (
        <Star className="me-1 inline size-3.5 fill-[var(--brass)] text-[var(--brass)]" aria-label="VIP" />
      ) : null}
      {[s.lastName, s.firstName].filter(Boolean).join(" ")}
    </Link>
  );

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Column
        icon={<LogIn />}
        title={t("arrivals")}
        count={arrivals.length}
        empty={t("noArrivals")}
        items={arrivals.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <div className="min-w-0 flex-1">
              {name(s)}
              <p className="text-xs text-fg-muted">
                #{s.number} | {s.typeCode} | {t("nights", { n: nights(s) })} | {s.adults + s.children} 👤
                {s.eta ? ` | ${t("eta", { time: s.eta })}` : ""}
                {s.arrival < businessDate ? ` | ${t("late", { day: day(s.arrival) })}` : ""}
              </p>
            </div>
            {s.status === "tentative" ? <StatusPill status="tentative" /> : null}
            {s.precheckinAt ? (
              <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
                ✓ {t("preregistered")}
              </span>
            ) : null}
            {canManage ? (
              <CheckInButton
                restaurantId={restaurantId}
                currency={currency}
                stayId={s.id}
                label={t("checkIn")}
              />
            ) : null}
          </li>
        ))}
      />
      <Column
        icon={<LogOut />}
        title={t("departures")}
        count={departures.length}
        empty={t("noDepartures")}
        items={departures.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <span className="grid h-9 min-w-12 place-items-center rounded-lg bg-surface-2 px-2 text-sm font-bold">
              {s.roomLabel}
            </span>
            <div className="min-w-0 flex-1">
              {name(s)}
              <p
                className={s.balanceCents > 0 ? "text-xs font-semibold text-danger" : "text-xs text-fg-muted"}
              >
                {s.balanceCents > 0 ? t("due", { amount: money(s.balanceCents) }) : t("settled")}
                {s.accountName ? ` | ${s.accountName}` : ""}
              </p>
            </div>
            {canManage ? (
              s.balanceCents > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`${base}/stays/${s.id}`}
                    className="inline-flex h-8 items-center rounded-full bg-accent px-3 text-sm font-semibold text-accent-fg"
                  >
                    {t("settle")}
                  </Link>
                  {s.accountName ? (
                    <RunButton
                      run={() => checkOutAction(restaurantId, s.id, true)}
                      confirm={t("confirmToAccount", { account: s.accountName })}
                    >
                      {t("toAccount")}
                    </RunButton>
                  ) : null}
                </div>
              ) : (
                <RunButton variant="primary" run={() => checkOutAction(restaurantId, s.id)}>
                  {t("checkOut")}
                </RunButton>
              )
            ) : null}
          </li>
        ))}
      />
      <Column
        icon={<BedDouble />}
        title={t("inHouse")}
        count={inHouse.length}
        empty={t("noInHouse")}
        items={inHouse.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-2.5">
            <span className="grid h-9 min-w-12 place-items-center rounded-lg bg-surface-2 px-2 text-sm font-bold">
              {s.roomLabel}
            </span>
            <div className="min-w-0 flex-1">
              {name(s)}
              <p className="text-xs text-fg-muted">
                {t("until", { day: day(s.departure) })} | {money(s.balanceCents)}
              </p>
            </div>
          </li>
        ))}
      />
      {canManage ? (
        <div className="xl:col-span-3">
          <NightAudit restaurantId={restaurantId} businessDate={businessDate} preflight={preflight} />
        </div>
      ) : null}
    </div>
  );
}

const nights = (s: DeskStay) =>
  Math.round((Date.parse(`${s.departure}T12:00:00Z`) - Date.parse(`${s.arrival}T12:00:00Z`)) / 86_400_000);

function Column({
  icon,
  title,
  count,
  items,
  empty,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  items: React.ReactNode[];
  empty: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)]">
      <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold">
        <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent-text [&_svg]:size-4">
          {icon}
        </span>
        {title}
        <span className="ms-auto rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold tabular-nums">
          {count}
        </span>
      </h2>
      {items.length ? <ul className="divide-y divide-border">{items}</ul> : <Empty>{empty}</Empty>}
    </section>
  );
}

function NightAudit({
  restaurantId,
  businessDate,
  preflight,
}: {
  restaurantId: string;
  businessDate: string;
  preflight: { dueOut: number; noShows: number };
}) {
  const t = useTranslations("pms.desk");
  const day = useDay();
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-[var(--sidebar)] p-5 text-[var(--sidebar-fg)]">
      <span className="grid size-11 place-items-center rounded-xl bg-white/10 text-[var(--brass)]">
        <MoonStar className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {t("auditTitle", { day: day(businessDate, { weekday: "long", day: "numeric", month: "long" }) })}
        </p>
        <p className="text-sm opacity-75">
          {preflight.dueOut
            ? t("auditBlocked", { n: preflight.dueOut })
            : preflight.noShows
              ? t("auditNoShows", { n: preflight.noShows })
              : t("auditReady")}
        </p>
      </div>
      <RunButton
        variant="primary"
        size="md"
        disabled={preflight.dueOut > 0}
        confirm={t("auditConfirm")}
        run={() => nightAuditAction(restaurantId)}
      >
        {t("auditRun")}
      </RunButton>
    </section>
  );
}
