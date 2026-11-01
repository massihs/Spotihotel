"use client";

import { Bell, CalendarPlus, Check, Clock, Copy, Phone, UserPlus, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { field, num, useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import { BookingSheet, NEXT, STATUS_TONE } from "./booking-sheet";
import {
  addToQueueAction,
  setReservationStatusAction,
  updateReservationSettingsAction,
} from "@/app/[locale]/dashboard/[restaurantId]/reservations/actions";

export type ReservationRow = {
  id: string;
  kind: string;
  queueNumber: number | null;
  name: string;
  phone: string;
  partySize: number;
  startsAt: string;
  status: string;
  source: string;
  note: string | null;
  tableLabel: string | null;
  notifiedAt: string | null;
};

const STATUS_STRIPE: Record<string, string> = {
  pending: "border-s-warning",
  confirmed: "border-s-tone-sky",
  notified: "border-s-tone-fuchsia",
  seated: "border-s-success",
  completed: "border-s-border-strong",
  cancelled: "border-s-danger",
  no_show: "border-s-danger",
};
const QUEUE_NEXT: Record<string, string[]> = {
  confirmed: ["notified", "seated", "cancelled"],
  notified: ["seated", "cancelled"],
};

function useMinutes() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return (iso: string) => Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
}

export function BookingList({
  rid,
  rows,
  timeZone,
  locale,
}: {
  rid: string;
  rows: ReservationRow[];
  timeZone: string;
  locale: string;
}) {
  const t = useTranslations("reservations");
  const { pending, error, run } = useRun();
  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  if (!rows.length)
    return (
      <p className="rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center text-fg-muted">
        {t("noBookings")}
      </p>
    );
  const hourOf = (iso: string) =>
    Number(
      new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)),
    );
  // Two services: lunch until 17:00, dinner after.
  const services = (["lunch", "dinner"] as const)
    .map((k) => ({ k, list: rows.filter((r) => hourOf(r.startsAt) < 17 === (k === "lunch")) }))
    .filter((g) => g.list.length);
  return (
    <div className="space-y-5">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {services.map(({ k, list }) => (
        <section key={k}>
          <h3 className="mb-2 flex items-center gap-2 px-1 text-sm font-bold text-fg-muted">
            {t(k)}
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums">
              {t("covers", {
                count: list
                  .filter((r) => !["cancelled", "no_show"].includes(r.status))
                  .reduce((s, r) => s + r.partySize, 0),
              })}
            </span>
          </h3>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)]">
            {list.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 border-s-4 px-4 py-3",
                  STATUS_STRIPE[r.status] ?? "border-s-transparent",
                  ["cancelled", "no_show"].includes(r.status) && "opacity-55",
                )}
              >
                <span className="w-16 shrink-0 text-center text-lg font-bold tabular-nums">
                  {time(r.startsAt)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {r.name}
                    <span className="ms-2 inline-flex items-center gap-1 text-sm font-normal text-fg-muted">
                      <Users className="size-3.5" />
                      {r.partySize}
                    </span>
                  </p>
                  <p className="flex flex-wrap gap-x-3 text-xs text-fg-muted">
                    <a
                      href={`tel:${r.phone}`}
                      dir="ltr"
                      className="inline-flex items-center gap-1 tabular-nums"
                    >
                      <Phone className="size-3" />
                      {r.phone}
                    </a>
                    {r.tableLabel ? (
                      <span>{t("tableN", { label: r.tableLabel })}</span>
                    ) : (
                      <span>{t("noTable")}</span>
                    )}
                    <span>{t(`sources.${r.source}`)}</span>
                    {r.note ? <span className="text-fg">« {r.note} »</span> : null}
                  </p>
                </div>
                <div className="flex w-full items-center gap-1 ps-[4.75rem] sm:w-auto sm:ps-0">
                  <span
                    className={cn(
                      "me-auto rounded-full px-2.5 py-0.5 text-xs font-semibold sm:me-2",
                      STATUS_TONE[r.status],
                    )}
                  >
                    {t(`status.${r.status}`)}
                  </span>
                  {(NEXT[r.status] ?? []).map((to) => (
                    <button
                      key={to}
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setReservationStatusAction(rid, r.id, to))}
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
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function QueueBoard({ rid, rows }: { rid: string; rows: ReservationRow[] }) {
  const t = useTranslations("reservations");
  const wait = useMinutes();
  const { pending, error, run } = useRun();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [size, setSize] = useState("2");
  const waiting = rows.filter((r) => r.status === "confirmed" || r.status === "notified");
  const done = rows.filter((r) => !(r.status === "confirmed" || r.status === "notified"));
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div>
        {error ? <p className="mb-2 text-sm text-danger">{error}</p> : null}
        <ul className="space-y-2">
          {waiting.map((r, i) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3"
            >
              <span
                className={cn(
                  "grid size-14 shrink-0 place-items-center rounded-2xl text-2xl font-black tabular-nums",
                  r.status === "notified"
                    ? "bg-tone-fuchsia text-white"
                    : i === 0
                      ? "bg-accent text-accent-fg"
                      : "bg-surface-2",
                )}
              >
                {r.queueNumber}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {r.name} • <Users className="inline size-3.5" /> {r.partySize}
                </p>
                <p className="flex items-center gap-1 text-xs text-fg-muted">
                  <Clock className="size-3" />
                  {t("waiting", { count: wait(r.startsAt) })}
                  {r.notifiedAt ? ` • ${t("notifiedAgo", { count: wait(r.notifiedAt) })}` : ""}
                </p>
              </div>
              <div className="flex gap-1">
                {(QUEUE_NEXT[r.status] ?? []).map((to) => (
                  <button
                    key={to}
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setReservationStatusAction(rid, r.id, to))}
                    className={cn(
                      "inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold",
                      to === "notified"
                        ? "bg-tone-fuchsia text-white"
                        : to === "seated"
                          ? "bg-accent text-accent-fg"
                          : "text-danger ring-1 ring-danger/30",
                    )}
                  >
                    {to === "notified" ? (
                      <Bell className="size-3.5" />
                    ) : to === "seated" ? (
                      <Check className="size-3.5" />
                    ) : (
                      <X className="size-3.5" />
                    )}
                    {t(`actions.${to}`)}
                  </button>
                ))}
              </div>
            </li>
          ))}
          {!waiting.length ? (
            <li className="rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center text-fg-muted">
              {t("queueEmpty")}
            </li>
          ) : null}
        </ul>
        {done.length ? (
          <p className="mt-3 text-xs text-fg-subtle">
            {t("queueDone", { count: done.filter((r) => r.status === "seated").length })}
          </p>
        ) : null}
      </div>
      <div className="h-fit space-y-3 rounded-2xl border border-border bg-surface p-4">
        <p className="flex items-center gap-2 font-semibold">
          <UserPlus className="size-5 text-accent" />
          {t("addWalkIn")}
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("name")}
          className={field}
        />
        <div className="flex gap-2">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09…"
            inputMode="tel"
            dir="ltr"
            className={field}
          />
          <input
            value={size}
            onChange={(e) => setSize(e.target.value)}
            inputMode="numeric"
            dir="ltr"
            className={cn(field, "w-20")}
            aria-label={t("party")}
          />
        </div>
        <button
          type="button"
          disabled={pending || !name.trim() || !phone.trim()}
          onClick={() =>
            run(
              () => addToQueueAction(rid, { name, phone, partySize: Math.trunc(num(size)) || 1 }),
              () => (setName(""), setPhone(""), setSize("2")),
            )
          }
          className="inline-flex h-11 w-full items-center justify-center rounded-full bg-accent font-semibold text-accent-fg disabled:opacity-50"
        >
          {t("giveTicket")}
        </button>
      </div>
    </div>
  );
}

export function NewBookingButton({
  rid,
  day,
  timeZone,
  defaultDuration,
}: {
  rid: string;
  day: string;
  timeZone: string;
  defaultDuration: number;
}) {
  const t = useTranslations("reservations");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg"
      >
        <CalendarPlus className="size-4" />
        {t("newBooking")}
      </button>
      {open ? (
        <BookingSheet
          rid={rid}
          timeZone={timeZone}
          defaultDuration={defaultDuration}
          initial={{ day, time: "20:00" }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function ReservationSettings({
  rid,
  initial,
  links,
}: {
  rid: string;
  initial: {
    enabled: boolean;
    autoConfirm: boolean;
    slotCapacity: number;
    maxParty: number;
    durationMin: number;
  };
  links: { book: string; queue: string };
}) {
  const t = useTranslations("reservations.settings");
  const { pending, error, run } = useRun();
  const [v, setV] = useState({
    ...initial,
    slotCapacity: String(initial.slotCapacity),
    maxParty: String(initial.maxParty),
    durationMin: String(initial.durationMin),
  });
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        {(["enabled", "autoConfirm"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={v[k]}
              onChange={(e) => (setV({ ...v, [k]: e.target.checked }), setSaved(false))}
              className="size-4 accent-[var(--accent)]"
            />
            {t(k)}
          </label>
        ))}
        <div className="grid grid-cols-3 gap-3">
          {(["slotCapacity", "maxParty", "durationMin"] as const).map((k) => (
            <label key={k} className="block text-sm font-medium">
              {t(k)}
              <input
                value={v[k]}
                onChange={(e) => (setV({ ...v, [k]: e.target.value }), setSaved(false))}
                inputMode="numeric"
                dir="ltr"
                className={cn(field, "mt-1")}
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-fg-muted">{t("hint")}</p>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                updateReservationSettingsAction(rid, {
                  enabled: v.enabled,
                  autoConfirm: v.autoConfirm,
                  slotCapacity: Math.trunc(num(v.slotCapacity)) || 40,
                  maxParty: Math.trunc(num(v.maxParty)) || 12,
                  durationMin: Math.trunc(num(v.durationMin)) || 90,
                }),
              () => setSaved(true),
            )
          }
          className="inline-flex h-10 items-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg"
        >
          {saved ? t("saved") : t("save")}
        </button>
      </div>
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <p className="font-semibold">{t("links")}</p>
        {(["book", "queue"] as const).map((k) => (
          <div key={k}>
            <p className="text-sm text-fg-muted">{t(`${k}Link`)}</p>
            <div className="mt-1 flex gap-2">
              <input readOnly value={links[k]} dir="ltr" className={cn(field, "h-10 text-xs")} />
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(links[k]).then(() => setCopied(k))}
                className="grid size-10 shrink-0 place-items-center rounded-full ring-1 ring-border"
                aria-label={t("copy")}
              >
                {copied === k ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
              </button>
            </div>
          </div>
        ))}
        <p className="text-xs text-fg-muted">{t("linksHint")}</p>
      </div>
    </div>
  );
}
