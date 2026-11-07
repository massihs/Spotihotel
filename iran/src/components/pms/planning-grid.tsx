"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  LoaderCircle,
  MousePointerClick,
  Search,
  Wand2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { normalizeDigits } from "@/lib/money";
import { EDITION } from "@/config/edition";
import { useRun } from "@/components/ui/sheet-kit";
import { Toast } from "@/components/ui/toast";
import {
  assignRoomAction,
  autoAssignRoomsAction,
} from "@/app/[locale]/dashboard/[restaurantId]/hotel-actions";
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

/** Busy nights of the week: Thursday–Friday in Iran, Friday–Saturday elsewhere. */
const WEEKEND = EDITION === "iran" ? [4, 5] : [5, 6];
const MOVABLE = ["tentative", "confirmed", "in_house"];

const BAR: Record<string, string> = {
  // Shades of the hotel's colour: pale for an option, mid for confirmed, deep for guests in house.
  tentative:
    "bg-brand-100 text-brand-800 ring-1 ring-inset ring-brand-300 [background-image:repeating-linear-gradient(135deg,transparent_0_6px,var(--brand-200)_6px_8px)]",
  confirmed: "bg-brand-400 text-white",
  in_house: "bg-brand-700 text-white",
  checked_out: "bg-surface-3 text-fg-muted",
};
const HK: Record<string, string> = {
  clean: "bg-success",
  inspected: "bg-success",
  dirty: "bg-danger",
  cleaning: "bg-warning",
  out_of_order: "bg-fg-subtle",
};

const nextDay = (d: string) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};

type Selection = { roomId: string; a: number; b: number };

export function PlanningGrid({
  restaurantId,
  nights,
  rooms,
  stays,
  availability,
  today,
  prevHref,
  nextHref,
  todayHref,
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
  todayHref: string;
  canManage: boolean;
}) {
  const t = useTranslations("pms.planning");
  const day = useDay();
  const router = useRouter();
  const run = useRun();
  const first = nights[0]!;
  const end = nights[nights.length - 1]!;
  const col = (d: string) => nights.indexOf(d);
  const unassigned = stays.filter((s) => !s.roomId && s.status !== "checked_out");
  const cols = `minmax(4.5rem,6rem) repeat(${nights.length}, minmax(2.6rem,1fr))`;

  // ── Filters: room type and room number ──
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");
  const types = useMemo(() => {
    const m = new Map<string, { id: string; code: string; count: number }>();
    for (const r of rooms) {
      if (!r.roomTypeId) continue;
      const x = m.get(r.roomTypeId) ?? { id: r.roomTypeId, code: r.typeCode ?? "?", count: 0 };
      x.count++;
      m.set(r.roomTypeId, x);
    }
    return [...m.values()];
  }, [rooms]);
  const q = normalizeDigits(query).trim();
  const shown = rooms.filter((r) => (!type || r.roomTypeId === type) && (!q || r.label.includes(q)));
  const byRoom = useMemo(() => {
    const m = new Map<string, PlanStay[]>();
    for (const s of stays) if (s.roomId) m.set(s.roomId, [...(m.get(s.roomId) ?? []), s]);
    return m;
  }, [stays]);
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  /** A night that can be sold in this room: today or later, room in service, nobody in it. */
  const bookable = (roomId: string, i: number) => {
    const d = nights[i];
    const room = roomById.get(roomId);
    if (!d || d < today || !room?.roomTypeId || room.housekeeping === "out_of_order") return false;
    return !(byRoom.get(roomId) ?? []).some(
      (s) => s.status !== "checked_out" && s.arrival <= d && d < s.departure,
    );
  };

  // ── Drag across free nights of a room: book them ──
  const [sel, setSel] = useState<Selection | null>(null);
  const selRef = useRef<Selection | null>(null);
  useEffect(() => {
    selRef.current = sel;
  }, [sel]);
  const selecting = sel?.roomId ?? null;
  useEffect(() => {
    if (!selecting) return;
    const extend = (s: Selection, j: number): Selection => {
      const step = j >= s.a ? 1 : -1;
      let b = s.a;
      for (let k = s.a + step; step > 0 ? k <= j : k >= j; k += step) {
        if (!bookable(s.roomId, k)) break;
        b = k;
      }
      return b === s.b ? s : { ...s, b };
    };
    const move = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-cell]");
      if (!el || el.dataset.room !== selecting) return;
      const j = Number(el.dataset.i);
      setSel((s) => (s ? extend(s, j) : s));
    };
    const up = () => {
      const s = selRef.current;
      setSel(null);
      if (!s) return;
      const room = roomById.get(s.roomId);
      const lo = Math.min(s.a, s.b);
      const hi = Math.max(s.a, s.b);
      if (!room?.roomTypeId) return;
      const params = new URLSearchParams({
        type: room.roomTypeId,
        room: room.id,
        arrival: nights[lo]!,
        departure: nextDay(nights[hi]!),
      });
      router.push(`/dashboard/${restaurantId}/stays/new?${params}`);
    };
    const cancel = () => setSel(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    // The handlers only need the room being selected; the grid data is stable meanwhile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecting]);

  const startSelect = (e: React.PointerEvent) => {
    if (!canManage || e.button !== 0) return;
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!cell) return;
    const roomId = cell.dataset.room!;
    const i = Number(cell.dataset.i);
    if (!bookable(roomId, i)) return;
    // Mouse: no text selection while dragging. Touch: a tap books one night, a swipe scrolls.
    if (e.pointerType === "mouse") e.preventDefault();
    setSel({ roomId, a: i, b: i });
  };

  // ── Drag a booking onto another room: move it (or upgrade it) ──
  const [moving, setMoving] = useState<PlanStay | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const canMove = (s: PlanStay) => canManage && MOVABLE.includes(s.status) && s.departure > today;
  const fits = (s: PlanStay, room: PlanRoom) => {
    if (room.id === s.roomId || room.housekeeping === "out_of_order" || !room.roomTypeId) return false;
    const from = s.status === "in_house" && s.arrival < today ? today : s.arrival;
    return !(byRoom.get(room.id) ?? []).some(
      (o) => o.id !== s.id && o.status !== "checked_out" && o.arrival < s.departure && o.departure > from,
    );
  };
  const dragProps = (s: PlanStay) =>
    canMove(s)
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            e.dataTransfer.setData("text/plain", `#${s.number}`);
            e.dataTransfer.effectAllowed = "move";
            setMoving(s);
          },
          onDragEnd: () => {
            setMoving(null);
            setOver(null);
          },
        }
      : { draggable: false };
  const drop = (room: PlanRoom) => {
    const s = moving;
    setMoving(null);
    setOver(null);
    if (!s || !fits(s, room)) return;
    run.run(
      () => assignRoomAction(restaurantId, s.id, room.id),
      () =>
        setToast(
          t(room.roomTypeId !== s.roomTypeId ? "upgraded" : "moved", { number: s.number, room: room.label }),
        ),
    );
  };

  // ── Rooms for every booking of the period that has none ──
  const [assigning, startAssign] = useTransition();
  const [assignError, setAssignError] = useState<string | null>(null);
  const tErr = useTranslations("errorCodes");
  const autoAssign = () =>
    startAssign(async () => {
      setAssignError(null);
      const res = await autoAssignRoomsAction(restaurantId, first < today ? today : first, nextDay(end));
      if (!res) return;
      if (!res.ok) {
        setAssignError(tErr.has(res.error) ? tErr(res.error) : tErr("internal"));
        return;
      }
      const r = res.data ?? { assigned: 0, left: 0 };
      setToast(
        r.left
          ? t("autoAssignedLeft", { n: r.assigned, left: r.left })
          : t("autoAssigned", { n: r.assigned }),
      );
    });
  const unassignedInView = unassigned.filter((s) => s.arrival >= today && s.arrival <= end).length;

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 transition",
      active
        ? "bg-brand-700 text-white ring-brand-700"
        : "bg-surface text-fg-muted ring-border hover:bg-brand-50 hover:text-fg",
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={prevHref}
          className="grid size-9 place-items-center rounded-full bg-surface ring-1 ring-border hover:bg-brand-50"
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
          className="grid size-9 place-items-center rounded-full bg-surface ring-1 ring-border hover:bg-brand-50"
          aria-label={t("next")}
        >
          <ChevronRight className="size-4 rtl:rotate-180" />
        </Link>
        <Link href={todayHref} className={chip(false)}>
          {t("today")}
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

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("filterType")} className="flex flex-wrap gap-1.5">
          <button type="button" className={chip(!type)} aria-pressed={!type} onClick={() => setType("")}>
            {t("allTypes")} <span className="tabular-nums opacity-70">{rooms.length}</span>
          </button>
          {types.map((x) => (
            <button
              key={x.id}
              type="button"
              className={chip(type === x.id)}
              aria-pressed={type === x.id}
              onClick={() => setType(type === x.id ? "" : x.id)}
            >
              {x.code} <span className="tabular-nums opacity-70">{x.count}</span>
            </button>
          ))}
        </div>
        <label className="relative ms-auto w-full sm:w-52">
          <span className="sr-only">{t("searchRoom")}</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            inputMode="numeric"
            placeholder={t("searchRoom")}
            className={cn(inputCls, "h-9 ps-9 pe-8")}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute end-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-fg-subtle hover:bg-surface-2"
              aria-label={t("clear")}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </label>
      </div>

      {canManage ? (
        <p className="flex items-center gap-2 text-xs text-fg-muted">
          <MousePointerClick className="size-4 shrink-0 text-brand-500" aria-hidden="true" />
          {t("hint")}
        </p>
      ) : null}
      <FormError error={run.error} />

      {unassigned.length ? (
        // A big hotel has hundreds of future bookings without a room yet: folded, soonest first.
        <details
          open={unassigned.length <= 8}
          className="group rounded-2xl border border-warning/40 bg-warning-soft/40 p-4 [&_summary::-webkit-details-marker]:hidden"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
            {t("unassigned", { n: unassigned.length })}
            <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          {canManage ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {unassignedInView ? (
                <button
                  type="button"
                  onClick={autoAssign}
                  disabled={assigning}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:opacity-60"
                >
                  {assigning ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Wand2 className="size-4" aria-hidden="true" />
                  )}
                  {t("autoAssign", { n: unassignedInView })}
                </button>
              ) : null}
              <p className="text-xs text-fg-muted">{t("unassignedHint")}</p>
              <FormError error={assignError} />
            </div>
          ) : null}
          <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto pe-1">
            {[...unassigned]
              .sort((a, b) => a.arrival.localeCompare(b.arrival))
              .map((s) => (
                <li
                  key={s.id}
                  {...dragProps(s)}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-lg text-sm",
                    canMove(s) && "cursor-grab active:cursor-grabbing",
                    moving?.id === s.id && "opacity-50",
                  )}
                >
                  {canMove(s) ? <GripVertical className="size-4 text-fg-subtle" aria-hidden="true" /> : null}
                  <Link
                    href={`/dashboard/${restaurantId}/stays/${s.id}`}
                    draggable={false}
                    className="font-semibold hover:underline"
                  >
                    #{s.number} {s.lastName}
                  </Link>
                  <span className="text-fg-muted">
                    {s.typeCode} | {day(s.arrival)} → {day(s.departure)}
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
        </details>
      ) : null}

      <div
        className={cn(
          "overflow-x-auto rounded-2xl border border-border bg-surface",
          run.pending && "pointer-events-none opacity-70",
        )}
        aria-busy={run.pending}
      >
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
                    WEEKEND.includes(wd) && "bg-surface-3/60",
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
          {availability
            .filter((a) => !type || a.id === type)
            .map((a) => (
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
          <div onPointerDown={startSelect} className={cn(sel && "select-none")}>
            {shown.map((r) => {
              const mine = byRoom.get(r.id) ?? [];
              const target = moving && over === r.id;
              const ok = moving ? fits(moving, r) : false;
              const upgrade = ok && moving && r.roomTypeId !== moving.roomTypeId;
              const ghost =
                target && ok && moving
                  ? {
                      from: moving.arrival < first ? 0 : col(moving.arrival),
                      to: moving.departure > end ? nights.length : col(moving.departure),
                    }
                  : null;
              const mineSel = sel?.roomId === r.id ? sel : null;
              return (
                <div
                  key={r.id}
                  data-room-row={r.label}
                  className={cn(
                    "relative grid h-11 border-b border-border transition-colors last:border-b-0",
                    target &&
                      (ok ? (upgrade ? "bg-warning-soft/60" : "bg-success-soft/60") : "bg-danger-soft/40"),
                  )}
                  style={{ gridTemplateColumns: cols }}
                  onDragOver={(e) => {
                    if (!moving) return;
                    if (fits(moving, r)) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }
                    if (over !== r.id) setOver(r.id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    drop(r);
                  }}
                >
                  <div
                    className="flex items-center gap-1.5 px-2 text-sm font-semibold"
                    style={{ gridRow: 1, gridColumn: 1 }}
                  >
                    <span
                      className={cn("size-2 shrink-0 rounded-full", HK[r.housekeeping] ?? "bg-fg-subtle")}
                      aria-hidden="true"
                    />
                    {r.label}
                    <span className="text-[10px] font-normal text-fg-muted">{r.typeCode}</span>
                  </div>
                  {nights.map((d, i) => {
                    const past = d < today;
                    return (
                      <div
                        key={d}
                        data-cell=""
                        data-room={r.id}
                        data-i={i}
                        // Placed explicitly: auto-placed cells would flow around the bookings into extra rows.
                        style={{ gridRow: 1, gridColumn: i + 2 }}
                        className={cn(
                          "border-s border-border",
                          d === today && "bg-accent-soft/40",
                          past && "bg-surface-2/50",
                          canManage &&
                            !past &&
                            r.housekeeping !== "out_of_order" &&
                            "cursor-cell hover:bg-brand-50",
                        )}
                      />
                    );
                  })}
                  {mine.map((s) => {
                    const from = s.arrival < first ? 0 : col(s.arrival);
                    const to = s.departure > end ? nights.length : col(s.departure);
                    if (from < 0 || to <= from) return null;
                    return (
                      <Link
                        key={s.id}
                        href={`/dashboard/${restaurantId}/stays/${s.id}`}
                        title={`#${s.number} ${s.lastName} ${s.firstName}`}
                        data-stay={s.number}
                        {...dragProps(s)}
                        className={cn(
                          "z-[1] mx-0.5 my-1.5 flex min-w-0 items-center truncate rounded-md px-2 text-xs font-semibold shadow-sm transition",
                          BAR[s.status] ?? BAR.confirmed,
                          canMove(s) && "cursor-grab hover:brightness-110 active:cursor-grabbing",
                          moving?.id === s.id && "opacity-40",
                        )}
                        style={{ gridRow: 1, gridColumn: `${from + 2} / ${to + 2}` }}
                      >
                        {s.lastName}
                      </Link>
                    );
                  })}
                  {ghost && ghost.to > ghost.from ? (
                    <div
                      className={cn(
                        "pointer-events-none z-[2] mx-0.5 my-1.5 flex min-w-0 items-center truncate rounded-md border-2 border-dashed px-2 text-xs font-semibold",
                        upgrade ? "border-warning text-warning" : "border-success text-success",
                      )}
                      style={{ gridRow: 1, gridColumn: `${ghost.from + 2} / ${ghost.to + 2}` }}
                    >
                      {upgrade ? t("upgrade") : moving?.lastName}
                    </div>
                  ) : null}
                  {mineSel ? (
                    <div
                      className="pointer-events-none z-[2] mx-0.5 my-1.5 flex min-w-0 items-center justify-center truncate rounded-md border-2 border-dashed border-brand-500 bg-brand-100/80 px-2 text-xs font-semibold text-brand-800"
                      style={{
                        gridRow: 1,
                        gridColumn: `${Math.min(mineSel.a, mineSel.b) + 2} / ${Math.max(mineSel.a, mineSel.b) + 3}`,
                      }}
                    >
                      {t("nights", { n: Math.abs(mineSel.b - mineSel.a) + 1 })}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!shown.length ? <p className="p-6 text-center text-sm text-fg-muted">{t("noRooms")}</p> : null}
          </div>
        </div>
      </div>
      <Toast message={toast} onDone={clearToast} />
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
