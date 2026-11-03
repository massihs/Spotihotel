"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useRun } from "@/components/ui/sheet-kit";
import { assignRoomAction } from "@/app/[locale]/dashboard/[restaurantId]/hotel-actions";
import { FormError, inputCls, useDay } from "./kit";

export type PlanRoom = {
  id: string;
  label: string;
  housekeeping: string;
  roomTypeId: string | null;
  typeCode: string | null;
};
export type PlanStay = {
  id: string;
  number: number;
  status: string;
  arrival: string;
  departure: string;
  roomId: string | null;
  roomTypeId: string;
  typeCode: string;
  firstName: string;
  lastName: string;
  balanceCents: number;
};
export type PlanAvail = { id: string; code: string; days: { day: string; free: number; closed: boolean }[] };

const BAR: Record<string, string> = {
  tentative: "bg-warning-soft text-fg ring-1 ring-warning/40",
  confirmed: "bg-info text-white",
  in_house: "bg-success text-white",
  checked_out: "bg-surface-3 text-fg-muted",
};
const HK: Record<string, string> = {
  clean: "bg-success",
  inspected: "bg-success",
  dirty: "bg-danger",
  cleaning: "bg-warning",
  out_of_order: "bg-fg-subtle",
};

export function PlanningGrid({
  restaurantId,
  nights,
  rooms,
  stays,
  availability,
  today,
  prevHref,
  nextHref,
  canManage,
}: {
  restaurantId: string;
  nights: string[];
  rooms: PlanRoom[];
  stays: PlanStay[];
  availability: PlanAvail[];
  today: string;
  prevHref: string;
  nextHref: string;
  canManage: boolean;
}) {
  const t = useTranslations("pms.planning");
  const day = useDay();
  const first = nights[0]!;
  const end = nights[nights.length - 1]!;
  const col = (d: string) => nights.indexOf(d);
  const unassigned = stays.filter((s) => !s.roomId && s.status !== "checked_out");
  const cols = `minmax(4.5rem,6rem) repeat(${nights.length}, minmax(2.6rem,1fr))`;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link
          href={prevHref}
          className="grid size-9 place-items-center rounded-full bg-surface ring-1 ring-border"
          aria-label={t("previous")}
        >
          <ChevronLeft className="size-4 rtl:rotate-180" />
        </Link>
        <p className="font-semibold">
          {day(first, { day: "numeric", month: "long" })} –{" "}
          {day(end, { day: "numeric", month: "long", year: "numeric" })}
        </p>
        <Link
          href={nextHref}
          className="grid size-9 place-items-center rounded-full bg-surface ring-1 ring-border"
          aria-label={t("next")}
        >
          <ChevronRight className="size-4 rtl:rotate-180" />
        </Link>
        <div className="ms-auto flex flex-wrap gap-3 text-xs text-fg-muted">
          {(["tentative", "confirmed", "in_house"] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={cn("size-3 rounded", BAR[s])} />
              {t(`legend.${s}`)}
            </span>
          ))}
        </div>
      </div>

      {unassigned.length ? (
        <section className="rounded-2xl border border-warning/40 bg-warning-soft/40 p-4">
          <h2 className="mb-2 text-sm font-semibold">{t("unassigned", { n: unassigned.length })}</h2>
          <ul className="space-y-2">
            {unassigned.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 text-sm">
                <Link
                  href={`/dashboard/${restaurantId}/stays/${s.id}`}
                  className="font-semibold hover:underline"
                >
                  #{s.number} {s.lastName}
                </Link>
                <span className="text-fg-muted">
                  {s.typeCode} · {day(s.arrival)} → {day(s.departure)}
                </span>
                {canManage ? (
                  <Assign
                    restaurantId={restaurantId}
                    stayId={s.id}
                    rooms={rooms.filter((r) => r.roomTypeId === s.roomTypeId)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <div className="min-w-[760px]">
          {/* Days */}
          <div
            className="sticky top-0 z-10 grid border-b border-border bg-surface-2 text-center text-[11px]"
            style={{ gridTemplateColumns: cols }}
          >
            <div className="px-2 py-2 text-start font-semibold text-fg-muted">{t("room")}</div>
            {nights.map((d) => {
              const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
              return (
                <div
                  key={d}
                  className={cn(
                    "border-s border-border px-0.5 py-1.5",
                    (wd === 5 || wd === 6) && "bg-surface-3/60",
                    d === today && "bg-accent-soft font-bold text-accent-text",
                  )}
                >
                  <div className="text-fg-muted">{day(d, { weekday: "narrow" })}</div>
                  <div className="font-semibold">{day(d, { day: "numeric" })}</div>
                </div>
              );
            })}
          </div>
          {/* Free rooms per type */}
          {availability.map((a) => (
            <div
              key={a.id}
              className="grid border-b border-border bg-surface-2/50 text-center text-[11px]"
              style={{ gridTemplateColumns: cols }}
            >
              <div className="px-2 py-1 text-start font-semibold text-fg-muted">
                {t("free", { code: a.code })}
              </div>
              {a.days.map((d) => (
                <div
                  key={d.day}
                  className={cn(
                    "border-s border-border py-1 font-semibold tabular-nums",
                    d.closed
                      ? "bg-danger-soft text-danger"
                      : d.free <= 0
                        ? "text-danger"
                        : d.free <= 1
                          ? "text-warning"
                          : "text-success",
                  )}
                  title={d.closed ? t("closed") : undefined}
                >
                  {d.closed ? "×" : d.free}
                </div>
              ))}
            </div>
          ))}
          {/* Rooms */}
          {rooms.map((r) => {
            const mine = stays.filter((s) => s.roomId === r.id);
            return (
              <div
                key={r.id}
                className="relative grid h-11 border-b border-border last:border-b-0"
                style={{ gridTemplateColumns: cols }}
              >
                <div className="flex items-center gap-1.5 px-2 text-sm font-semibold">
                  <span
                    className={cn("size-2 shrink-0 rounded-full", HK[r.housekeeping] ?? "bg-fg-subtle")}
                    aria-hidden="true"
                  />
                  {r.label}
                  <span className="text-[10px] font-normal text-fg-muted">{r.typeCode}</span>
                </div>
                {nights.map((d) => (
                  <div key={d} className={cn("border-s border-border", d === today && "bg-accent-soft/40")} />
                ))}
                {mine.map((s) => {
                  const from = s.arrival < first ? 0 : col(s.arrival);
                  const to = s.departure > end ? nights.length : col(s.departure);
                  if (from < 0 || to <= from) return null;
                  return (
                    <Link
                      key={s.id}
                      href={`/dashboard/${restaurantId}/stays/${s.id}`}
                      title={`#${s.number} ${s.lastName} ${s.firstName}`}
                      className={cn(
                        "z-[1] mx-0.5 my-1.5 flex min-w-0 items-center truncate rounded-md px-2 text-xs font-semibold shadow-sm",
                        BAR[s.status] ?? BAR.confirmed,
                      )}
                      style={{ gridRow: 1, gridColumn: `${from + 2} / ${to + 2}` }}
                    >
                      {s.lastName}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Assign({
  restaurantId,
  stayId,
  rooms,
}: {
  restaurantId: string;
  stayId: string;
  rooms: PlanRoom[];
}) {
  const t = useTranslations("pms.planning");
  const [room, setRoom] = useState("");
  const r = useRun();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <select
        className={cn(inputCls, "h-8 w-auto py-0 text-sm")}
        value={room}
        disabled={r.pending}
        onChange={(e) => {
          setRoom(e.target.value);
          if (e.target.value) r.run(() => assignRoomAction(restaurantId, stayId, e.target.value));
        }}
        aria-label={t("assign")}
      >
        <option value="">{t("assign")}</option>
        {rooms.map((x) => (
          <option key={x.id} value={x.id}>
            {x.label}
          </option>
        ))}
      </select>
      <FormError error={r.error} />
    </span>
  );
}
