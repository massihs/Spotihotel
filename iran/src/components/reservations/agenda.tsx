"use client";

import { AlertTriangle, CalendarPlus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { BookingSheet, clock, type SheetBooking } from "./booking-sheet";

export type AgendaTable = { id: string; label: string; capacity: number | null; zone: string | null };
export type AgendaBooking = SheetBooking & { source: string };

/** Width of 30 minutes on the timeline. */
const SLOT_W = 52;
const SLOT_MIN = 30;
const ROW_H = 60;

const BLOCK: Record<string, string> = {
  pending: "bg-warning-soft text-fg ring-warning/50 border-s-warning",
  confirmed: "bg-tone-sky/12 text-fg ring-tone-sky/40 border-s-tone-sky",
  notified: "bg-tone-fuchsia/12 text-fg ring-tone-fuchsia/40 border-s-tone-fuchsia",
  seated: "bg-success-soft text-fg ring-success/40 border-s-success",
  completed: "bg-surface-2 text-fg-muted ring-border border-s-border-strong",
  no_show: "bg-danger-soft/60 text-fg-muted ring-danger/30 border-s-danger line-through",
};

const hhmm = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Greedy lanes, so bookings without a table never hide each other. */
function lanes<T extends { start: number; end: number }>(items: T[]) {
  const ends: number[] = [];
  return items.map((it) => {
    let lane = ends.findIndex((e) => e <= it.start);
    if (lane < 0) lane = ends.length;
    ends[lane] = it.end;
    return { ...it, lane };
  });
}

/**
 * The day as a planning board: one row per table, time running along. A booking is a block as
 * long as the sitting; tapping a free cell books that table at that time.
 */
export function Agenda({
  rid,
  day,
  isToday,
  timeZone,
  dayStartsAt,
  tables,
  bookings,
  ranges,
  durationMin,
}: {
  rid: string;
  day: string;
  isToday: boolean;
  timeZone: string;
  dayStartsAt: string;
  tables: AgendaTable[];
  bookings: AgendaBooking[];
  ranges: { open: number; close: number }[];
  durationMin: number;
}) {
  const t = useTranslations("reservations");
  const scroller = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<
    { kind: "new"; time: string; tableId: string | null } | { kind: "edit"; booking: AgendaBooking } | null
  >(null);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const closed = ranges.length === 0;
  const base = Date.parse(dayStartsAt);
  const placed = useMemo(
    () =>
      bookings.map((b) => {
        const start = Math.round((Date.parse(b.startsAt) - base) / 60_000);
        return { b, start, end: start + b.durationMin };
      }),
    [bookings, base],
  );
  // Opening hours frame the day; a booking outside them widens it rather than being cut off.
  const startMin =
    Math.floor(
      Math.min(...(closed ? [12 * 60] : ranges.map((r) => r.open)), ...placed.map((p) => p.start)) / 60,
    ) * 60;
  const endMin =
    Math.ceil(
      Math.max(...(closed ? [23 * 60] : ranges.map((r) => r.close)), ...placed.map((p) => p.end)) / 60,
    ) * 60;
  const slots = Array.from({ length: (endMin - startMin) / SLOT_MIN }, (_, i) => startMin + i * SLOT_MIN);
  const width = slots.length * SLOT_W;
  const x = (m: number) => ((m - startMin) / SLOT_MIN) * SLOT_W;
  const isOpen = (m: number) => closed || ranges.some((r) => m >= r.open && m < r.close);

  const known = new Set(tables.map((tb) => tb.id));
  // Bookings made before the agenda existed may share a table: flag them so the team fixes them.
  const clashes = useMemo(() => {
    const ids = new Set<string>();
    const live = placed.filter((p) => p.b.tableId && !["completed", "no_show"].includes(p.b.status));
    for (const a of live)
      for (const b of live)
        if (a !== b && a.b.tableId === b.b.tableId && a.start < b.end && b.start < a.end) ids.add(a.b.id);
    return ids;
  }, [placed]);
  const loose = lanes(placed.filter((p) => !p.b.tableId || !known.has(p.b.tableId)));
  const looseLanes = Math.max(1, ...loose.map((l) => l.lane + 1));
  const nowMin = isToday && now !== null ? Math.round((now - base) / 60_000) : null;

  // Open on the current time (or the first booking), not on noon.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = nowMin ?? placed[0]?.start ?? null;
    if (target === null) return;
    // Keep the target a quarter into the visible track (nothing moves when the day fits).
    const label = el.querySelector<HTMLElement>("[data-agenda-label]")?.offsetWidth ?? 112;
    const offset = Math.max(0, x(target) - (el.clientWidth - label) * 0.25);
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollLeft = rtl ? -offset : offset;
    // Only when the day changes: later ticks must not yank the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, nowMin === null]);

  const block = (p: { b: AgendaBooking; start: number; end: number }, top: number, height: number) => (
    <button
      key={p.b.id}
      type="button"
      onClick={() => setSheet({ kind: "edit", booking: p.b })}
      style={{
        insetInlineStart: x(p.start) + 2,
        width: Math.max(SLOT_W, x(p.end) - x(p.start)) - 4,
        top,
        height,
      }}
      className={cn(
        "absolute z-10 flex flex-col justify-center overflow-hidden rounded-xl border-s-4 px-2 text-start ring-1 transition-shadow hover:shadow-[var(--shadow-float)]",
        BLOCK[p.b.status] ?? BLOCK.confirmed,
        clashes.has(p.b.id) && "ring-2 ring-danger",
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-bold">
        {clashes.has(p.b.id) ? (
          <AlertTriangle className="size-3.5 shrink-0 text-danger" aria-label={t("agenda.clash")} />
        ) : null}
        <span className="truncate">{p.b.name}</span>
        <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold opacity-75">
          <Users className="size-3" aria-hidden="true" />
          {p.b.partySize}
        </span>
      </span>
      <span className="truncate text-[11px] tabular-nums opacity-75">
        <bdi dir="ltr">
          {clock(p.b.startsAt, timeZone)}–{hhmm(p.end)}
        </bdi>
      </span>
    </button>
  );

  const cells = (tableId: string | null, height: number) =>
    slots.map((m) => (
      <button
        key={m}
        type="button"
        disabled={!isOpen(m)}
        onClick={() => setSheet({ kind: "new", time: hhmm(m), tableId })}
        aria-label={`${t("newBooking")} ${hhmm(m)}`}
        style={{ insetInlineStart: x(m), width: SLOT_W, height }}
        className={cn(
          "group absolute top-0 border-e border-border/70",
          m % 60 === 0 && "border-e-border",
          isOpen(m) ? "hover:bg-accent-soft/60" : "cursor-not-allowed bg-surface-2/70",
        )}
      >
        <CalendarPlus
          className="mx-auto hidden size-4 text-accent-text group-hover:block group-disabled:hidden"
          aria-hidden="true"
        />
      </button>
    ));

  const nowLine =
    nowMin !== null && nowMin >= startMin && nowMin <= endMin ? (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-danger"
        style={{ insetInlineStart: x(nowMin) }}
      />
    ) : null;

  return (
    <div className="space-y-3">
      {clashes.size ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {t("agenda.clashes", { n: clashes.size })}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-fg-muted">
        <span>{closed ? t("agenda.closed") : t("agenda.tapToBook")}</span>
        <span className="ms-auto flex flex-wrap gap-2">
          {["pending", "confirmed", "seated", "completed"].map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-sm border-s-4", BLOCK[s])} aria-hidden="true" />
              {t(`status.${s}`)}
            </span>
          ))}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)]">
        <div ref={scroller} className="overflow-x-auto overscroll-x-contain">
          <div className="relative w-max">
            {/* Hours */}
            <div className="sticky top-0 z-30 flex border-b border-border bg-surface">
              <div
                data-agenda-label
                className="sticky start-0 z-30 w-20 shrink-0 border-e border-border bg-surface sm:w-28"
              />
              <div className="relative h-9" style={{ width }}>
                {slots
                  .filter((m) => m % 60 === 0)
                  .map((m) => (
                    <span
                      key={m}
                      className="absolute top-2 -translate-x-1/2 text-xs font-semibold text-fg-muted tabular-nums rtl:translate-x-1/2"
                      style={{ insetInlineStart: x(m) }}
                    >
                      <bdi dir="ltr">{hhmm(m)}</bdi>
                    </span>
                  ))}
              </div>
            </div>

            {tables.map((tb) => (
              <div key={tb.id} className="flex border-b border-border last:border-b-0">
                <div className="sticky start-0 z-20 flex w-20 shrink-0 flex-col justify-center border-e border-border bg-surface px-2 sm:w-28 sm:px-3">
                  <span className="truncate font-bold">{tb.label}</span>
                  <span className="truncate text-[11px] text-fg-muted">
                    {tb.capacity ? t("agenda.seats", { n: tb.capacity }) : ""}
                    {tb.zone ? ` · ${tb.zone}` : ""}
                  </span>
                </div>
                {(() => {
                  const own = lanes(placed.filter((p) => p.b.tableId === tb.id));
                  const n = Math.max(1, ...own.map((o) => o.lane + 1));
                  const h = n === 1 ? ROW_H : n * 52 + 8;
                  return (
                    <div className="relative" style={{ width, height: h }}>
                      {cells(tb.id, h)}
                      {own.map((p) => (n === 1 ? block(p, 6, ROW_H - 12) : block(p, 4 + p.lane * 52, 46)))}
                      {nowLine}
                    </div>
                  );
                })()}
              </div>
            ))}

            {/* Bookings with no table yet (or tables removed since) */}
            <div className="flex border-t-2 border-dashed border-border bg-surface-2/40">
              <div className="sticky start-0 z-20 flex w-20 shrink-0 flex-col justify-center border-e border-border bg-surface px-2 sm:w-28 sm:px-3">
                <span className="truncate font-bold">{t("agenda.unassigned")}</span>
                <span className="text-[11px] text-fg-muted">{tables.length ? "" : t("agenda.noTables")}</span>
              </div>
              <div className="relative" style={{ width, height: looseLanes * 52 + 8 }}>
                {cells(null, looseLanes * 52 + 8)}
                {loose.map((p) => block(p, 4 + p.lane * 52, 46))}
                {nowLine}
              </div>
            </div>
          </div>
        </div>
      </div>

      {sheet ? (
        <BookingSheet
          rid={rid}
          timeZone={timeZone}
          defaultDuration={durationMin}
          initial={sheet.kind === "new" ? { day, time: sheet.time, tableId: sheet.tableId } : undefined}
          booking={sheet.kind === "edit" ? sheet.booking : undefined}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}
