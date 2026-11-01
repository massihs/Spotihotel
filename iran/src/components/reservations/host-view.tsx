"use client";

import {
  Armchair,
  Cake,
  Check,
  Clock,
  Globe,
  Heart,
  LayoutGrid,
  Minus,
  MoreHorizontal,
  Phone,
  Plus,
  RotateCcw,
  Save,
  Shapes,
  Sparkles,
  Briefcase,
  Users,
  UserPlus,
  Wand2,
  ZoomIn,
  ZoomOut,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  assignTableAction,
  saveFloorPlanAction,
  seatAction,
  setReservationStatusAction,
  walkInAction,
} from "@/app/[locale]/dashboard/[restaurantId]/reservations/actions";
import { Sheet, useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import { tableSize } from "@/lib/floor-plan";
import { BookingSheet, clock, type SheetBooking } from "./booking-sheet";

export type HostTable = {
  id: string;
  label: string;
  capacity: number | null;
  zone: string | null;
  zoneKey: string;
  shape: string;
  x: number;
  y: number;
  w: number;
  h: number;
};
export type HostBooking = SheetBooking & { source: string; occasion: string | null };
type Occupied = { tableId: string; since: string; people: number };

const DONE = ["completed", "no_show", "cancelled"];
const UPCOMING = ["pending", "confirmed", "notified"];
const SHAPES = ["square", "round", "rect"] as const;
const SOON_MS = 2 * 3600_000;
const OCCASION_ICON: Record<string, typeof Cake> = {
  birthday: Cake,
  anniversary: Heart,
  date: Sparkles,
  business: Briefcase,
  family: Users,
};

const start = (b: HostBooking) => Date.parse(b.startsAt);
const end = (b: HostBooking) => start(b) + b.durationMin * 60_000;

type TableState =
  | { kind: "free"; next?: HostBooking }
  | { kind: "soon"; booking: HostBooking }
  | { kind: "reserved"; booking: HostBooking }
  | { kind: "seated"; booking: HostBooking }
  | { kind: "occupied"; people: number };

const STATE_STYLE: Record<TableState["kind"], string> = {
  free: "bg-surface text-fg ring-border-strong",
  soon: "bg-warning-soft text-fg ring-warning",
  reserved: "bg-tone-sky/15 text-fg ring-tone-sky",
  seated: "bg-accent text-accent-fg ring-accent",
  occupied: "bg-accent text-accent-fg ring-accent",
};

/** Small chairs around a table: on a circle for round ones, along the long sides otherwise. */
function Chairs({ shape, seats, w, h }: { shape: string; seats: number; w: number; h: number }) {
  const n = Math.min(seats, 12);
  const dots: { left: string; top: string }[] = [];
  if (shape === "round") {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      dots.push({ left: `${50 + Math.cos(a) * 50}%`, top: `${50 + Math.sin(a) * 50}%` });
    }
  } else {
    const sides = shape === "square" && n > 4 && w === h;
    const perSide = sides ? Math.ceil(n / 4) : Math.ceil(n / 2);
    const place = (count: number, fn: (f: number) => { left: string; top: string }) => {
      for (let i = 0; i < count; i++) dots.push(fn((i + 1) / (count + 1)));
    };
    const top = Math.min(perSide, n);
    const bottom = Math.min(perSide, n - top);
    place(top, (f) => ({ left: `${f * 100}%`, top: "0%" }));
    place(bottom, (f) => ({ left: `${f * 100}%`, top: "100%" }));
    if (sides) {
      const rest = n - top - bottom;
      place(Math.ceil(rest / 2), (f) => ({ left: "0%", top: `${f * 100}%` }));
      place(Math.floor(rest / 2), (f) => ({ left: "100%", top: `${f * 100}%` }));
    } else if (n === 1) dots.splice(1);
    void h;
  }
  return (
    <>
      {dots.map((d, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg-subtle/45"
          style={d}
        />
      ))}
    </>
  );
}

/**
 * The host stand, like OpenTable's: the floor plan with each table's state at the chosen time
 * (free, booked soon, booked, seated), the day's list next to it, and one-tap actions — seat a
 * booking at the table you tap, give a booking a table, seat a walk-in, free a table. The owner
 * drags tables into place and picks their shape in edit mode.
 */
export function HostView({
  rid,
  day,
  isToday,
  timeZone,
  dayStartsAt,
  tables,
  bookings,
  occupied,
  ranges,
  durationMin,
  maxParty,
  canEdit,
  cols,
  rows,
}: {
  rid: string;
  day: string;
  isToday: boolean;
  timeZone: string;
  dayStartsAt: string;
  tables: HostTable[];
  bookings: HostBooking[];
  occupied: Occupied[];
  ranges: { open: number; close: number }[];
  durationMin: number;
  maxParty: number;
  canEdit: boolean;
  cols: number;
  rows: number;
}) {
  const t = useTranslations("reservations");
  const th = useTranslations("reservations.host");
  const { pending, error, run } = useRun();
  const base = Date.parse(dayStartsAt);
  const first = ranges.length ? Math.min(...ranges.map((r) => r.open)) : 12 * 60;
  const last = ranges.length ? Math.max(...ranges.map((r) => r.close)) : 23 * 60;
  const [now, setNow] = useState<number | null>(null);
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  // First paint: "now" on today's plan, the start of service on another day.
  const viewAt = at ?? (isToday && now ? now : base + first * 60_000);
  const live = isToday && now != null && Math.abs(viewAt - now) < 20 * 60_000;

  const zones = useMemo(() => [...new Set(tables.map((x) => x.zoneKey))], [tables]);
  const [zone, setZone] = useState(zones[0] ?? "");
  const [pick, setPick] = useState<{ booking: HostBooking; mode: "seat" | "assign" } | null>(null);
  const [panel, setPanel] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ booking?: HostBooking; tableId?: string | null } | null>(null);
  const [editing, setEditing] = useState(false);
  // Phones see the whole room by default; zoom gives the full-size plan with a side scroll.
  const [zoom, setZoom] = useState(false);
  const [layout, setLayout] = useState<Record<string, { x: number; y: number; shape: string }>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; px: number; py: number; x: number; y: number } | null>(null);

  const occ = useMemo(() => new Map(occupied.map((o) => [o.tableId, o])), [occupied]);
  const active = bookings.filter((b) => !DONE.includes(b.status));
  const tableById = useMemo(() => new Map(tables.map((x) => [x.id, x])), [tables]);

  const stateOf = (tableId: string): TableState => {
    const list = active.filter((b) => b.tableId === tableId);
    const seated = list.find((b) => b.status === "seated");
    if (seated && live) return { kind: "seated", booking: seated };
    const current = list.find((b) => start(b) <= viewAt && viewAt < end(b));
    if (current) return { kind: current.status === "seated" ? "seated" : "reserved", booking: current };
    const o = occ.get(tableId);
    if (o && live) return { kind: "occupied", people: o.people };
    const next = list.filter((b) => start(b) > viewAt).sort((a, b) => start(a) - start(b))[0];
    if (next && start(next) - viewAt <= SOON_MS) return { kind: "soon", booking: next };
    return { kind: "free", next };
  };

  const fits = (tb: HostTable, b: HostBooking) => {
    if (tb.capacity != null && tb.capacity < b.partySize) return false;
    const s = stateOf(tb.id).kind;
    if (pick?.mode === "seat")
      return s === "free" || s === "soon" || (s === "reserved" && b.tableId === tb.id);
    // A table is free for this booking if no other active booking overlaps its sitting.
    return !active.some(
      (o) => o.id !== b.id && o.tableId === tb.id && start(o) < end(b) && start(b) < end(o),
    );
  };

  const pos = (tb: HostTable) => {
    const p = { ...tb, ...(layout[tb.id] ?? {}) };
    return { ...p, ...tableSize(p.shape, tb.capacity) };
  };
  const shown = tables.filter((x) => x.zoneKey === zone);
  // Outside edit mode the plan is only as tall as the room needs.
  const usedRows = Math.max(0, ...shown.map((tb) => pos(tb).y + pos(tb).h)) + 1;
  const viewRows = editing ? rows : Math.max(6, Math.min(rows, usedRows));

  const onTable = (tb: HostTable) => {
    if (editing) return setSelected(tb.id);
    if (pick) {
      if (!fits(tb, pick.booking)) return;
      const b = pick.booking;
      setPick(null);
      return run(() =>
        pick.mode === "seat" ? seatAction(rid, b.id, tb.id) : assignTableAction(rid, b.id, tb.id),
      );
    }
    setPanel(tb.id);
  };

  const pointerDown = (e: React.PointerEvent, tb: HostTable) => {
    if (!editing) return;
    const p = pos(tb);
    drag.current = { id: tb.id, px: e.clientX, py: e.clientY, x: p.x, y: p.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setSelected(tb.id);
  };
  const pointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = canvas.current;
    if (!d || !el) return;
    const cell = el.clientWidth / cols;
    const tb = pos(tableById.get(d.id)!);
    const x = Math.max(0, Math.min(cols - tb.w, d.x + Math.round((e.clientX - d.px) / cell)));
    const y = Math.max(0, Math.min(rows - tb.h, d.y + Math.round((e.clientY - d.py) / cell)));
    setLayout((l) => ({ ...l, [d.id]: { x, y, shape: l[d.id]?.shape ?? tb.shape } }));
  };
  const pointerUp = () => {
    drag.current = null;
  };

  const tidy = () => {
    // Rows of tables in the current zone, small ones first.
    const list = shown.map(pos).sort((a, b) => (a.capacity ?? 0) - (b.capacity ?? 0));
    let x = 1;
    let y = 1;
    let rowH = 0;
    const next: typeof layout = { ...layout };
    for (const tb of list) {
      if (x + tb.w > cols - 1) {
        x = 1;
        y += rowH + 1;
        rowH = 0;
      }
      next[tb.id] = { x, y: Math.min(y, rows - tb.h), shape: next[tb.id]?.shape ?? tb.shape };
      x += tb.w + 1;
      rowH = Math.max(rowH, tb.h);
    }
    setLayout(next);
  };

  const saveLayout = () =>
    run(
      () =>
        saveFloorPlanAction(
          rid,
          tables.map((tb) => {
            const p = pos(tb);
            return { id: tb.id, x: p.x, y: p.y, shape: p.shape };
          }),
        ),
      () => (setEditing(false), setLayout({}), setSelected(null)),
    );

  const covers = active
    .filter((b) => start(b) <= viewAt && viewAt < end(b))
    .reduce((s, b) => s + b.partySize, 0);
  const sorted = [...bookings].sort((a, b) => start(a) - start(b));
  const groups = [
    { key: "upcoming", list: sorted.filter((b) => UPCOMING.includes(b.status)) },
    { key: "seated", list: sorted.filter((b) => b.status === "seated") },
    { key: "done", list: sorted.filter((b) => b.status === "completed" || b.status === "no_show") },
  ];
  const panelTable = panel ? tableById.get(panel) : null;
  const minuteOf = (ms: number) => Math.round((ms - base) / 60_000);
  const label = (m: number) =>
    `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-3">
        {/* Toolbar: zones, time, legend, edit */}
        <div className="flex flex-wrap items-center gap-2">
          {zones.length > 1
            ? zones.map((z) => (
                <button
                  key={z || "main"}
                  type="button"
                  onClick={() => setZone(z)}
                  className={cn(
                    "h-9 rounded-full px-4 text-sm font-semibold",
                    zone === z ? "bg-ink text-ink-fg" : "bg-surface ring-1 ring-border",
                  )}
                >
                  {z || th("mainRoom")}
                </button>
              ))
            : null}
          <span className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm font-semibold ring-1 ring-border">
            <Users className="size-4 text-accent-text" aria-hidden="true" />
            {th("coversAt", { count: covers })}
          </span>
          {canEdit ? (
            editing ? (
              <>
                <button
                  type="button"
                  onClick={tidy}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-sm font-semibold ring-1 ring-border"
                >
                  <Wand2 className="size-4" aria-hidden="true" />
                  {th("tidy")}
                </button>
                <button
                  type="button"
                  onClick={() => (setEditing(false), setLayout({}), setSelected(null))}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-sm font-semibold ring-1 ring-border"
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  {th("cancelEdit")}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={saveLayout}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-bold text-accent-fg disabled:opacity-50"
                >
                  <Save className="size-4" aria-hidden="true" />
                  {th("savePlan")}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => (setEditing(true), setPick(null))}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-sm font-semibold ring-1 ring-border"
              >
                <LayoutGrid className="size-4" aria-hidden="true" />
                {th("editPlan")}
              </button>
            )
          ) : null}
        </div>

        {!editing ? (
          <div className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-2.5 ring-1 ring-border">
            <Clock className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            <span className="w-12 shrink-0 text-lg font-black tabular-nums" dir="ltr">
              {label(minuteOf(viewAt))}
            </span>
            <input
              type="range"
              min={first}
              max={Math.max(first, last - 15)}
              step={15}
              value={Math.max(first, Math.min(last, minuteOf(viewAt)))}
              onChange={(e) => setAt(base + Number(e.target.value) * 60_000)}
              className="min-w-0 flex-1 accent-[var(--accent)]"
              aria-label={th("timeAt")}
              dir="ltr"
            />
            {isToday ? (
              <button
                type="button"
                onClick={() => setAt(null)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-bold",
                  live ? "bg-success-soft text-success" : "bg-surface-2",
                )}
              >
                {th("now")}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl bg-accent-soft px-4 py-2.5 text-sm font-medium text-accent-text">
            {th("editHint")}
          </p>
        )}

        {pick ? (
          <div className="flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-ink-fg">
            <Armchair className="size-5 shrink-0" aria-hidden="true" />
            <p className="flex-1 text-sm font-semibold">
              {pick.mode === "seat"
                ? th("pickSeat", { name: pick.booking.name, count: pick.booking.partySize })
                : th("pickAssign", { name: pick.booking.name })}
            </p>
            <button
              type="button"
              onClick={() => setPick(null)}
              className="grid size-8 place-items-center rounded-full bg-white/15"
              aria-label={th("close")}
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}

        {/* The plan */}
        <div className="relative overflow-x-auto rounded-3xl bg-surface p-3 ring-1 ring-border">
          {editing ? null : (
            <button
              type="button"
              onClick={() => setZoom(!zoom)}
              aria-pressed={zoom}
              aria-label={zoom ? th("zoomFit") : th("zoomIn")}
              className="sticky start-0 z-10 mb-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-bold ring-1 ring-border sm:hidden"
            >
              {zoom ? (
                <ZoomOut className="size-4" aria-hidden="true" />
              ) : (
                <ZoomIn className="size-4" aria-hidden="true" />
              )}
              {zoom ? th("zoomFit") : th("zoomIn")}
            </button>
          )}
          <div
            ref={canvas}
            dir="ltr"
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            className={cn(
              "@container relative touch-none rounded-2xl bg-surface-2/60",
              (editing || zoom) && "min-w-[640px]",
            )}
            style={{
              aspectRatio: `${cols} / ${viewRows}`,
              backgroundImage: "radial-gradient(var(--border-strong) 1px, transparent 1px)",
              backgroundSize: `${100 / cols}% ${100 / viewRows}%`,
            }}
          >
            {shown.map((tb) => {
              const p = pos(tb);
              const s = stateOf(tb.id);
              const candidate = pick ? fits(tb, pick.booking) : false;
              const b = "booking" in s ? s.booking : null;
              // Two-seaters are too small for a name: the label and the time only.
              const small = p.w <= 2 || p.h <= 2;
              return (
                <button
                  key={tb.id}
                  type="button"
                  onPointerDown={(e) => pointerDown(e, tb)}
                  onClick={() => onTable(tb)}
                  aria-label={`${t("tableN", { label: tb.label })} — ${th(`state.${s.kind}`)}`}
                  className={cn(
                    "absolute p-[0.6%] transition-[opacity,transform]",
                    editing && "cursor-grab active:cursor-grabbing",
                    pick && !candidate && "opacity-35",
                  )}
                  style={{
                    left: `${(p.x / cols) * 100}%`,
                    top: `${(p.y / viewRows) * 100}%`,
                    width: `${(p.w / cols) * 100}%`,
                    height: `${(p.h / viewRows) * 100}%`,
                  }}
                >
                  <span className="relative block size-full p-[9%]">
                    <Chairs shape={p.shape} seats={tb.capacity ?? 4} w={p.w} h={p.h} />
                    <span
                      className={cn(
                        "relative flex size-full flex-col items-center justify-center gap-0.5 overflow-hidden px-1 text-center shadow-[var(--shadow-soft)] ring-2",
                        p.shape === "round" ? "rounded-full" : "rounded-xl",
                        STATE_STYLE[s.kind],
                        candidate && "animate-pulse ring-4 ring-success",
                        editing && selected === tb.id && "ring-4 ring-fg",
                      )}
                    >
                      <span
                        className={cn(
                          "leading-none font-black @max-xl:text-xs",
                          small ? "text-sm" : "text-base",
                        )}
                      >
                        {tb.label}
                      </span>
                      {b ? (
                        <>
                          <span
                            className="text-[11px] leading-tight font-bold tabular-nums @max-xl:text-[9px]"
                            dir="ltr"
                          >
                            {clock(b.startsAt, timeZone)}
                          </span>
                          {small ? null : (
                            <span className="w-full truncate text-[10px] leading-tight font-semibold opacity-90 @max-xl:hidden">
                              {b.name}
                            </span>
                          )}
                        </>
                      ) : small ? null : s.kind === "occupied" ? (
                        <span className="text-[10px] leading-tight font-semibold @max-xl:hidden">
                          {th("qrGuests")}
                        </span>
                      ) : (
                        <span className="text-[10px] leading-tight opacity-60 @max-xl:hidden">
                          {th("seats", { count: tb.capacity ?? 0 })}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
            {shown.length === 0 ? (
              <p className="absolute inset-0 grid place-items-center text-sm text-fg-muted">
                {th("noTables")}
              </p>
            ) : null}
          </div>
        </div>

        {editing && selected ? (
          <div className="flex items-center gap-2 rounded-2xl bg-surface px-4 py-2.5 ring-1 ring-border">
            <Shapes className="size-4 text-fg-muted" aria-hidden="true" />
            <span className="me-auto text-sm font-semibold">
              {t("tableN", { label: tableById.get(selected)?.label ?? "" })}
            </span>
            {SHAPES.map((sh) => (
              <button
                key={sh}
                type="button"
                onClick={() =>
                  setLayout((l) => {
                    const tb = tableById.get(selected)!;
                    const p = { ...tb, ...(l[selected] ?? {}) };
                    return { ...l, [selected]: { x: p.x, y: p.y, shape: sh } };
                  })
                }
                className={cn(
                  "h-8 rounded-full px-3 text-xs font-bold",
                  pos(tableById.get(selected)!).shape === sh ? "bg-ink text-ink-fg" : "bg-surface-2",
                )}
              >
                {th(`shapes.${sh}`)}
              </button>
            ))}
          </div>
        ) : null}

        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
          {(["free", "soon", "reserved", "seated"] as const).map((k) => (
            <li key={k} className="inline-flex items-center gap-1.5">
              <span className={cn("size-3 rounded-sm ring-2", STATE_STYLE[k])} aria-hidden="true" />
              {th(`state.${k}`)}
            </li>
          ))}
        </ul>
        {error ? <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      </div>

      {/* The day's list */}
      <aside className="space-y-4 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto">
        <button
          type="button"
          onClick={() => setSheet({})}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-bold text-accent-fg shadow-accent"
        >
          <Plus className="size-5" aria-hidden="true" />
          {t("newBooking")}
        </button>
        {groups.map((g) =>
          g.list.length || g.key === "upcoming" ? (
            <section key={g.key}>
              <h3 className="mb-2 flex items-center justify-between text-sm font-bold text-fg-muted">
                {th(`groups.${g.key}`)}
                <span className="tabular-nums">{g.list.length}</span>
              </h3>
              {g.list.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border-strong px-4 py-5 text-center text-sm text-fg-muted">
                  {th("noneUpcoming")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {g.list.map((b) => (
                    <BookingRow
                      key={b.id}
                      b={b}
                      table={b.tableId ? tableById.get(b.tableId)?.label : undefined}
                      timeZone={timeZone}
                      picking={pick?.booking.id === b.id}
                      busy={pending}
                      onSeat={() =>
                        b.tableId
                          ? run(() => seatAction(rid, b.id, b.tableId))
                          : (setPick({ booking: b, mode: "seat" }), setEditing(false))
                      }
                      onAssign={() => (setPick({ booking: b, mode: "assign" }), setEditing(false))}
                      onStatus={(to) => run(() => setReservationStatusAction(rid, b.id, to))}
                      onEdit={() => setSheet({ booking: b })}
                    />
                  ))}
                </ul>
              )}
            </section>
          ) : null,
        )}
      </aside>

      {panelTable ? (
        <TablePanel
          table={panelTable}
          state={stateOf(panelTable.id)}
          bookings={active.filter((b) => b.tableId === panelTable.id)}
          timeZone={timeZone}
          maxParty={maxParty}
          busy={pending}
          onClose={() => setPanel(null)}
          onWalkIn={(partySize, name) =>
            run(
              () => walkInAction(rid, { tableId: panelTable.id, partySize, name }),
              () => setPanel(null),
            )
          }
          onBook={() => (setPanel(null), setSheet({ tableId: panelTable.id }))}
          onFinish={(id) =>
            run(
              () => setReservationStatusAction(rid, id, "completed"),
              () => setPanel(null),
            )
          }
          onSeat={(id) =>
            run(
              () => seatAction(rid, id, panelTable.id),
              () => setPanel(null),
            )
          }
        />
      ) : null}
      {sheet ? (
        <BookingSheet
          rid={rid}
          timeZone={timeZone}
          defaultDuration={durationMin}
          initial={
            sheet.booking
              ? undefined
              : { day, time: label(Math.ceil(minuteOf(viewAt) / 15) * 15), tableId: sheet.tableId ?? null }
          }
          booking={sheet.booking}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}

function BookingRow({
  b,
  table,
  timeZone,
  picking,
  busy,
  onSeat,
  onAssign,
  onStatus,
  onEdit,
}: {
  b: HostBooking;
  table?: string;
  timeZone: string;
  picking: boolean;
  busy: boolean;
  onSeat: () => void;
  onAssign: () => void;
  onStatus: (to: string) => void;
  onEdit: () => void;
}) {
  const t = useTranslations("reservations");
  const th = useTranslations("reservations.host");
  const [more, setMore] = useState(false);
  const Occ = b.occasion ? OCCASION_ICON[b.occasion] : null;
  const Src = b.source === "online" ? Globe : b.source === "walk_in" ? UserPlus : Phone;
  const done = DONE.includes(b.status);
  return (
    <li
      className={cn(
        "rounded-2xl bg-surface p-3 ring-1 ring-border",
        picking && "ring-2 ring-accent",
        done && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid min-w-14 shrink-0 place-items-center rounded-xl bg-surface-2 px-2 py-1.5 text-center">
          <span className="text-sm font-black tabular-nums" dir="ltr">
            {clock(b.startsAt, timeZone)}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-fg-muted">
            <Users className="size-3" aria-hidden="true" />
            {b.partySize}
          </span>
        </span>
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-start">
          <p className="flex items-center gap-1.5 truncate font-bold">
            {b.name}
            {Occ ? (
              <Occ className="size-3.5 shrink-0 text-accent-text" aria-label={th(`occasion.${b.occasion}`)} />
            ) : null}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
            <Src className="size-3" aria-hidden="true" />
            <span>{table ? t("tableN", { label: table }) : th("noTable")}</span>
            <span className="font-semibold">{t(`status.${b.status}`)}</span>
          </p>
          {b.note ? <p className="mt-1 line-clamp-1 text-xs text-fg-subtle">{b.note}</p> : null}
        </button>
        {!done ? (
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-surface-2"
            aria-label={th("more")}
            aria-expanded={more}
          >
            <MoreHorizontal className="size-4" />
          </button>
        ) : null}
      </div>
      {!done ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {b.status === "pending" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onStatus("confirmed")}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-success px-3 text-xs font-bold text-white"
            >
              <Check className="size-3.5" aria-hidden="true" />
              {th("confirm")}
            </button>
          ) : b.status === "seated" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onStatus("completed")}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-ink px-3 text-xs font-bold text-ink-fg"
            >
              {th("finish")}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onSeat}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-accent px-3 text-xs font-bold text-accent-fg"
            >
              <Armchair className="size-3.5" aria-hidden="true" />
              {th("seat")}
            </button>
          )}
          {b.status !== "seated" ? (
            <button
              type="button"
              onClick={onAssign}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-surface-2 px-3 text-xs font-bold"
            >
              {table ? th("moveTable") : th("giveTable")}
            </button>
          ) : null}
          {more ? (
            <>
              {b.status !== "seated" && b.status !== "pending" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onStatus("no_show")}
                  className="inline-flex h-8 items-center rounded-full bg-danger-soft px-3 text-xs font-bold text-danger"
                >
                  {th("noShow")}
                </button>
              ) : null}
              {b.status !== "seated" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => window.confirm(th("cancelConfirm")) && onStatus("cancelled")}
                  className="inline-flex h-8 items-center rounded-full bg-surface-2 px-3 text-xs font-bold text-danger"
                >
                  {th("cancel")}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function TablePanel({
  table,
  state,
  bookings,
  timeZone,
  maxParty,
  busy,
  onClose,
  onWalkIn,
  onBook,
  onFinish,
  onSeat,
}: {
  table: HostTable;
  state: TableState;
  bookings: HostBooking[];
  timeZone: string;
  maxParty: number;
  busy: boolean;
  onClose: () => void;
  onWalkIn: (partySize: number, name: string) => void;
  onBook: () => void;
  onFinish: (id: string) => void;
  onSeat: (id: string) => void;
}) {
  const t = useTranslations("reservations");
  const th = useTranslations("reservations.host");
  const [size, setSize] = useState(Math.min(2, table.capacity ?? 2));
  const [name, setName] = useState("");
  const seated = bookings.find((b) => b.status === "seated");
  const upcoming = bookings.filter((b) => b.status !== "seated").sort((a, b) => start(a) - start(b));
  return (
    <Sheet title={t("tableN", { label: table.label })} onClose={onClose}>
      <p className="-mt-2 mb-4 text-sm text-fg-muted">
        {th("seats", { count: table.capacity ?? 0 })}
        {table.zone ? ` · ${table.zone}` : ""} ·{" "}
        <span className="font-semibold">{th(`state.${state.kind}`)}</span>
      </p>
      {seated ? (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-accent-soft p-3">
          <Armchair className="size-5 text-accent-text" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{seated.name}</p>
            <p className="text-xs text-fg-muted">
              {th("seatedSince", { time: clock(seated.startsAt, timeZone), count: seated.partySize })}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => onFinish(seated.id)}
            className="h-9 rounded-full bg-ink px-4 text-sm font-bold text-ink-fg"
          >
            {th("free")}
          </button>
        </div>
      ) : (
        <div className="mb-4 rounded-2xl border border-border p-3">
          <p className="mb-2 flex items-center gap-2 font-bold">
            <UserPlus className="size-4 text-accent-text" aria-hidden="true" />
            {th("walkIn")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-full bg-surface-2 p-1">
              <button
                type="button"
                onClick={() => setSize((n) => Math.max(1, n - 1))}
                className="grid size-8 place-items-center rounded-full bg-surface"
                aria-label="-"
              >
                <Minus className="size-4" />
              </button>
              <span className="w-8 text-center font-black tabular-nums">{size}</span>
              <button
                type="button"
                onClick={() => setSize((n) => Math.min(maxParty, n + 1))}
                className="grid size-8 place-items-center rounded-full bg-surface"
                aria-label="+"
              >
                <Plus className="size-4" />
              </button>
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={th("walkInNamePlaceholder")}
              maxLength={120}
              className="h-10 min-w-0 flex-1 rounded-xl border border-border-strong bg-surface px-3 text-sm"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => onWalkIn(size, name)}
              className="h-10 rounded-full bg-accent px-4 text-sm font-bold text-accent-fg disabled:opacity-50"
            >
              {th("seatNow")}
            </button>
          </div>
        </div>
      )}
      <p className="mb-2 text-sm font-bold text-fg-muted">{th("todayOnTable")}</p>
      {upcoming.length ? (
        <ul className="mb-4 space-y-2">
          {upcoming.map((b) => (
            <li key={b.id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-2.5">
              <span className="text-sm font-black tabular-nums" dir="ltr">
                {clock(b.startsAt, timeZone)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {b.name} · {b.partySize}
              </span>
              {!seated && b.status !== "pending" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSeat(b.id)}
                  className="h-8 rounded-full bg-accent px-3 text-xs font-bold text-accent-fg"
                >
                  {th("seat")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-fg-muted">{th("nothingToday")}</p>
      )}
      <button
        type="button"
        onClick={onBook}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-full font-bold ring-1 ring-border hover:bg-surface-2"
      >
        <Plus className="size-4" aria-hidden="true" />
        {th("bookThisTable")}
      </button>
    </Sheet>
  );
}
