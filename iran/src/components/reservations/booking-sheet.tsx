"use client";

import { AlertTriangle, Minus, Phone, Plus, UserCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Sheet, field, useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import {
  availabilityAction,
  createBookingAction,
  customerByPhoneAction,
  setReservationStatusAction,
  updateBookingAction,
} from "@/app/[locale]/dashboard/[restaurantId]/reservations/actions";

export const STATUS_TONE: Record<string, string> = {
  pending: "bg-warning-soft text-warning",
  confirmed: "bg-tone-sky/12 text-tone-sky",
  notified: "bg-tone-fuchsia/12 text-tone-fuchsia",
  seated: "bg-success-soft text-success",
  completed: "bg-surface-2 text-fg-muted",
  cancelled: "bg-danger-soft text-danger",
  no_show: "bg-danger-soft text-danger",
};
export const NEXT: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["seated", "no_show", "cancelled"],
  notified: ["seated", "no_show", "cancelled"],
  seated: ["completed"],
};
const EDITABLE = ["pending", "confirmed", "notified", "seated"];
const DURATIONS = [60, 90, 120, 150, 180, 240];

export type SheetBooking = {
  id: string;
  name: string;
  phone: string;
  partySize: number;
  startsAt: string;
  durationMin: number;
  status: string;
  tableId: string | null;
  note: string | null;
};

type Availability = {
  durationMin: number;
  seatsLeft: number;
  duplicate: { name: string; startsAt: string } | null;
  tables: {
    id: string;
    label: string;
    capacity: number | null;
    zone: string | null;
    state: "free" | "taken" | "small";
    takenBy: { name: string; startsAt: string } | null;
  }[];
};

/** "HH:MM" of an instant on the restaurant's clock. */
export function clock(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}
export function localDate(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}

/**
 * New booking (taken on the phone) or an existing one to move / edit. While the team types, the
 * sheet shows which tables are free at that time, so a table can never be given twice.
 */
export function BookingSheet({
  rid,
  timeZone,
  defaultDuration,
  initial,
  booking,
  onClose,
}: {
  rid: string;
  timeZone: string;
  defaultDuration: number;
  /** Prefill for a new booking (from the agenda: the tapped table and time). */
  initial?: { day: string; time: string; tableId?: string | null };
  booking?: SheetBooking;
  onClose: () => void;
}) {
  const t = useTranslations("reservations");
  const locale = useLocale();
  const { pending, error, run } = useRun();
  const editing = !!booking;
  const locked = booking ? !EDITABLE.includes(booking.status) : false;
  const [name, setName] = useState(booking?.name ?? "");
  const [phone, setPhone] = useState(booking?.phone ?? "");
  const [size, setSize] = useState(booking?.partySize ?? 2);
  const [day, setDay] = useState(booking ? localDate(booking.startsAt, timeZone) : (initial?.day ?? ""));
  const [time, setTime] = useState(booking ? clock(booking.startsAt, timeZone) : (initial?.time ?? "20:00"));
  const [duration, setDuration] = useState(booking?.durationMin ?? defaultDuration);
  // "auto" lets the server pick the smallest free table.
  const [table, setTable] = useState<string>(
    booking ? (booking.tableId ?? "none") : initial?.tableId ? initial.tableId : "auto",
  );
  const [note, setNote] = useState(booking?.note ?? "");
  const [avail, setAvail] = useState<Availability | null>(null);
  const [known, setKnown] = useState<{
    name: string | null;
    bookings: number;
    noShows: number;
  } | null>(null);

  // Live availability for the chosen time, party and length (debounced).
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return;
    let stale = false;
    const id = setTimeout(async () => {
      const res = await availabilityAction(rid, {
        day,
        time,
        durationMin: duration,
        partySize: size,
        phone: phone.length >= 10 ? phone : undefined,
        excludeId: booking?.id,
      });
      if (!stale && res?.ok && res.data) setAvail(res.data);
    }, 250);
    return () => {
      stale = true;
      clearTimeout(id);
    };
  }, [rid, day, time, duration, size, phone, booking?.id]);

  // A known mobile fills the name and shows the guest's history.
  useEffect(() => {
    if (editing || phone.replace(/\D/g, "").length < 10) return;
    let stale = false;
    const id = setTimeout(async () => {
      const res = await customerByPhoneAction(rid, phone);
      if (stale || !res?.ok) return;
      setKnown(res.data ?? null);
      if (res.data?.name) setName((n) => n || res.data!.name!);
    }, 400);
    return () => {
      stale = true;
      clearTimeout(id);
    };
  }, [rid, phone, editing]);

  const chosen = avail?.tables.find((x) => x.id === table);
  const blocked =
    !!avail?.duplicate ||
    (chosen ? chosen.state !== "free" : false) ||
    (table === "none" && avail ? avail.seatsLeft < size : false);
  const tableId = table === "auto" ? undefined : table === "none" ? null : table;

  const save = () =>
    run(
      () =>
        booking
          ? updateBookingAction(rid, booking.id, {
              name,
              phone,
              partySize: size,
              day,
              time,
              durationMin: duration,
              tableId: tableId === undefined ? booking.tableId : tableId,
              note,
            })
          : createBookingAction(rid, {
              name,
              phone,
              partySize: size,
              day,
              time,
              durationMin: duration,
              tableId,
              note,
              area: "any",
            }),
      onClose,
    );

  return (
    <Sheet title={editing ? t("agenda.editBooking") : t("newBooking")} onClose={onClose}>
      <div className="space-y-4">
        {booking ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", STATUS_TONE[booking.status])}>
              {t(`status.${booking.status}`)}
            </span>
            <a
              href={`tel:${booking.phone}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-xs font-semibold"
            >
              <Phone className="size-3.5" aria-hidden="true" />
              {t("agenda.call")}
            </a>
            <span className="ms-auto flex flex-wrap gap-1">
              {(NEXT[booking.status] ?? []).map((to) => (
                <button
                  key={to}
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => setReservationStatusAction(rid, booking.id, to), onClose)}
                  className={cn(
                    "h-8 rounded-full px-3 text-xs font-semibold",
                    to === "seated" || to === "confirmed"
                      ? "bg-accent text-accent-fg"
                      : to === "completed"
                        ? "bg-surface-2"
                        : "text-danger ring-1 ring-danger/30",
                  )}
                >
                  {t(`actions.${to}`)}
                </button>
              ))}
            </span>
          </div>
        ) : null}

        <fieldset disabled={locked} className="space-y-4 disabled:opacity-60">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t("agenda.phone")}</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09…"
                inputMode="tel"
                dir="ltr"
                autoFocus={!editing}
                className={field}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t("name")}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
            </label>
          </div>
          {known ? (
            <p className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent-text">
              <UserCheck className="size-4 shrink-0" aria-hidden="true" />
              {t("agenda.known", { bookings: known.bookings })}
              {known.noShows ? (
                <span className="font-bold text-danger">· {t("agenda.noShows", { n: known.noShows })}</span>
              ) : null}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="col-span-2 block space-y-1 sm:col-span-1">
              <span className="text-sm font-medium">{t("date")}</span>
              <input
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                dir="ltr"
                className={field}
              />
              {/^\d{4}-\d{2}-\d{2}$/.test(day) ? (
                // The picker is Gregorian; say the day in the team's own calendar.
                <span className="block text-xs text-fg-muted">
                  {new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    timeZone: "UTC",
                  }).format(new Date(`${day}T12:00:00Z`))}
                </span>
              ) : null}
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t("time")}</span>
              <input
                type="time"
                step={900}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                dir="ltr"
                className={field}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t("agenda.duration")}</span>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className={field}
              >
                {[...new Set([...DURATIONS, duration])]
                  .sort((a, b) => a - b)
                  .map((d) => (
                    <option key={d} value={d}>
                      {t("agenda.minutes", { n: d })}
                    </option>
                  ))}
              </select>
            </label>
            <div className="col-span-2 space-y-1 sm:col-span-1">
              <span className="block text-sm font-medium">{t("party")}</span>
              <div className="flex h-11 items-center justify-between rounded-xl border border-border-strong bg-surface px-1">
                <button
                  type="button"
                  onClick={() => setSize((n) => Math.max(1, n - 1))}
                  className="grid size-9 place-items-center rounded-lg hover:bg-surface-2"
                  aria-label="−"
                >
                  <Minus className="size-4" />
                </button>
                <span className="text-lg font-bold tabular-nums">{size}</span>
                <button
                  type="button"
                  onClick={() => setSize((n) => Math.min(200, n + 1))}
                  className="grid size-9 place-items-center rounded-lg hover:bg-surface-2"
                  aria-label="+"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{t("agenda.table")}</span>
              {avail ? (
                <span
                  className={cn(
                    "text-xs font-semibold",
                    avail.seatsLeft < size ? "text-danger" : "text-fg-muted",
                  )}
                >
                  {t("agenda.seatsLeft", { n: avail.seatsLeft })}
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {[
                { id: "auto", label: t("agenda.tableAuto"), sub: "" },
                { id: "none", label: t("agenda.tableNone"), sub: "" },
              ].map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setTable(o.id)}
                  aria-pressed={table === o.id}
                  className={cn(
                    "min-h-14 rounded-xl px-2 py-2 text-sm font-semibold ring-1 transition-colors",
                    table === o.id
                      ? "bg-fg text-bg ring-fg"
                      : "bg-surface ring-border hover:ring-border-strong",
                  )}
                >
                  {o.label}
                </button>
              ))}
              {(avail?.tables ?? []).map((x) => (
                <button
                  key={x.id}
                  type="button"
                  disabled={x.state !== "free" && table !== x.id}
                  onClick={() => setTable(x.id)}
                  aria-pressed={table === x.id}
                  title={
                    x.takenBy
                      ? t("agenda.taken", { name: x.takenBy.name, time: clock(x.takenBy.startsAt, timeZone) })
                      : undefined
                  }
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center rounded-xl px-2 py-1.5 text-sm ring-1 transition-colors",
                    table === x.id
                      ? x.state === "free"
                        ? "bg-accent text-accent-fg ring-accent"
                        : "bg-danger-soft text-danger ring-danger"
                      : x.state === "free"
                        ? "bg-success-soft/60 ring-success/30 hover:ring-success"
                        : "cursor-not-allowed bg-surface-2 text-fg-subtle ring-transparent",
                  )}
                >
                  <span className="font-bold">{x.label}</span>
                  <span className="max-w-full truncate text-[11px] opacity-80">
                    {x.state === "taken"
                      ? `${x.takenBy?.name} · ${clock(x.takenBy!.startsAt, timeZone)}`
                      : x.state === "small"
                        ? t("agenda.small")
                        : x.capacity
                          ? t("agenda.seats", { n: x.capacity })
                          : t("agenda.free")}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {avail?.duplicate ? (
            <p
              role="alert"
              className="flex gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t("agenda.duplicate", {
                name: avail.duplicate.name,
                time: clock(avail.duplicate.startsAt, timeZone),
              })}
            </p>
          ) : null}

          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("note")}
            maxLength={500}
            className={field}
          />
        </fieldset>
        {error ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
        {!locked ? (
          <button
            type="button"
            disabled={pending || blocked || !name.trim() || !phone.trim() || !day}
            onClick={save}
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-accent font-semibold text-accent-fg disabled:opacity-50"
          >
            {t("save")}
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
