"use client";

import {
  Ban,
  BedDouble,
  BellRing,
  Check,
  ClipboardCheck,
  DoorOpen,
  Hand,
  LogOut,
  QrCode,
  ReceiptText,
  Sparkles,
  SprayCan,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  checkOutRoomAction,
  setHousekeepingAction,
} from "@/app/[locale]/dashboard/[restaurantId]/rooms/actions";
import { moveRequestAction } from "@/app/[locale]/dashboard/[restaurantId]/requests/actions";
import { CALL_ICON } from "@/components/guest/call-icons";
import { Sheet, useRun } from "@/components/ui/sheet-kit";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";

type RoomRequest = {
  id: string;
  kind: string;
  label: string | null;
  note: string | null;
  status: string;
  createdAt: string;
};
export type RoomView = {
  id: string;
  label: string;
  capacity: number | null;
  floor: string;
  housekeeping: string;
  housekeepingAt: string | null;
  guests: number | null;
  since: string | null;
  todayCents: number;
  requests: RoomRequest[];
  orders: { id: string; number: string; status: string; totalCents: number }[];
};

const HK = ["clean", "dirty", "cleaning", "inspected", "out_of_order"] as const;
type Hk = (typeof HK)[number];
const HK_STYLE: Record<Hk, { dot: string; chip: string; Icon: typeof Check }> = {
  clean: { dot: "bg-success", chip: "bg-success-soft text-success", Icon: Sparkles },
  dirty: { dot: "bg-danger", chip: "bg-danger-soft text-danger", Icon: SprayCan },
  cleaning: { dot: "bg-warning", chip: "bg-warning-soft text-warning", Icon: Hand },
  inspected: { dot: "bg-info", chip: "bg-info-soft text-info", Icon: ClipboardCheck },
  out_of_order: { dot: "bg-fg-subtle", chip: "bg-surface-3 text-fg-muted", Icon: Ban },
};
const hk = (v: string): Hk => ((HK as readonly string[]).includes(v) ? (v as Hk) : "clean");
const FILTERS = ["all", "occupied", "free", "dirty", "requests"] as const;

/**
 * Every room of the hotel by floor. A tile says at a glance whether guests are in, how
 * housekeeping stands and whether the room is waiting on a request or room service; a tap opens
 * the room: housekeeping in one tap, its requests and orders, check-out.
 */
export function RoomsBoard({
  restaurantId,
  rooms,
  floors,
  icons,
  timeZone,
  currency,
  canAct,
  canCheckOut,
}: {
  restaurantId: string;
  rooms: RoomView[];
  floors: { key: string; label: string | null; numbered: boolean }[];
  icons: Record<string, string>;
  timeZone: string;
  currency: string;
  canAct: boolean;
  canCheckOut: boolean;
}) {
  const t = useTranslations("hotel.rooms");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rooms.find((r) => r.id === openId) ?? null;

  const inService = rooms.filter((r) => hk(r.housekeeping) !== "out_of_order");
  const occupied = rooms.filter((r) => r.guests != null).length;
  const rate = inService.length ? Math.round((occupied / inService.length) * 100) : 0;
  const count = (h: Hk) => rooms.filter((r) => hk(r.housekeeping) === h).length;
  const withRequests = rooms.filter((r) => r.requests.length).length;
  const shown = rooms.filter((r) =>
    filter === "occupied"
      ? r.guests != null
      : filter === "free"
        ? r.guests == null && hk(r.housekeeping) !== "out_of_order"
        : filter === "dirty"
          ? ["dirty", "cleaning"].includes(r.housekeeping)
          : filter === "requests"
            ? r.requests.length > 0
            : true,
  );

  if (!rooms.length)
    return (
      <div className="rounded-3xl border border-dashed border-border-strong px-6 py-14 text-center">
        <BedDouble className="mx-auto size-10 text-fg-subtle" aria-hidden="true" />
        <p className="mt-3 font-bold">{t("emptyTitle")}</p>
        <p className="mt-1 text-sm text-fg-muted">{t("emptyBody")}</p>
        <Link
          href={`/dashboard/${restaurantId}/tables`}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-accent-fg"
        >
          <QrCode className="size-4" aria-hidden="true" />
          {t("addRooms")}
        </Link>
      </div>
    );

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary
          label={t("occupancy")}
          value={`${rate}%`}
          hint={t("occupiedOf", { n: occupied, total: inService.length })}
        >
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-ink" style={{ width: `${rate}%` }} />
          </div>
        </Summary>
        <Summary
          label={t("toClean")}
          value={count("dirty")}
          hint={t("cleaningN", { n: count("cleaning") })}
          tone="danger"
        />
        <Summary label={t("withRequests")} value={withRequests} tone={withRequests ? "warning" : undefined} />
        <Summary label={t("outOfOrder")} value={count("out_of_order")} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn(
                "h-9 shrink-0 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors",
                filter === f
                  ? "bg-ink text-ink-fg"
                  : "bg-surface text-fg-muted ring-1 ring-border hover:text-fg",
              )}
            >
              {t(`filters.${f}`)}
            </button>
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted">
          {HK.map((h) => (
            <li key={h} className="inline-flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", HK_STYLE[h].dot)} aria-hidden="true" />
              {t(`hk.${h}`)}
            </li>
          ))}
        </ul>
      </div>

      {floors.map((f) => {
        const list = shown.filter((r) => r.floor === f.key);
        if (!list.length) return null;
        const busy = rooms.filter((r) => r.floor === f.key && r.guests != null).length;
        const total = rooms.filter((r) => r.floor === f.key).length;
        return (
          <section
            key={f.key}
            className="rounded-3xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)] sm:p-5"
          >
            <h2 className="mb-3 flex items-baseline justify-between gap-3">
              <span className="text-base font-bold">
                {f.label == null
                  ? t("otherRooms")
                  : f.numbered
                    ? f.label === "0"
                      ? t("groundFloor")
                      : t("floorN", { n: f.label })
                    : f.label}
              </span>
              <span className="text-xs font-medium text-fg-muted tabular-nums">
                {t("occupiedOf", { n: busy, total })}
              </span>
            </h2>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
              {list.map((r) => (
                <RoomTile key={r.id} room={r} onOpen={() => setOpenId(r.id)} />
              ))}
            </div>
          </section>
        );
      })}

      {open ? (
        <RoomSheet
          restaurantId={restaurantId}
          room={open}
          icons={icons}
          timeZone={timeZone}
          currency={currency}
          canAct={canAct}
          canCheckOut={canCheckOut}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  );
}

function Summary({
  label,
  value,
  hint,
  tone,
  children,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "danger" | "warning";
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)]">
      <p className="text-xs font-semibold text-fg-muted">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tracking-tight tabular-nums",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p> : null}
      {children}
    </div>
  );
}

function RoomTile({ room, onOpen }: { room: RoomView; onOpen: () => void }) {
  const t = useTranslations("hotel.rooms");
  const h = hk(room.housekeeping);
  const occupied = room.guests != null;
  const off = h === "out_of_order";
  const open = room.requests.filter((r) => r.status === "open").length;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${room.label} — ${occupied ? t("occupied") : t("free")} — ${t(`hk.${h}`)}`}
      className={cn(
        "group relative flex aspect-[1.05] flex-col justify-between overflow-hidden rounded-2xl p-2.5 text-start ring-1 transition-shadow hover:shadow-[var(--shadow-float)]",
        occupied ? "bg-ink text-ink-fg ring-ink" : "bg-surface-2 ring-border",
        off &&
          "[background-image:repeating-linear-gradient(135deg,transparent_0_8px,var(--border)_8px_9px)] opacity-60",
        open > 0 && "ring-2 ring-danger",
      )}
    >
      <span className="flex items-start justify-between gap-1">
        <span className="text-lg leading-none font-black tabular-nums">{room.label}</span>
        <span className="flex gap-1">
          {room.requests.length ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              <BellRing className="size-3" aria-hidden="true" />
              {room.requests.length}
            </span>
          ) : null}
          {room.orders.length ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full bg-info px-1 text-[10px] font-bold text-white">
              <ReceiptText className="size-3" aria-hidden="true" />
              {room.orders.length}
            </span>
          ) : null}
        </span>
      </span>
      <span
        className={cn(
          "flex items-center gap-1 text-xs font-semibold",
          occupied ? "opacity-90" : "text-fg-muted",
        )}
      >
        {off ? (
          <Ban className="size-3.5" aria-hidden="true" />
        ) : occupied ? (
          <Users className="size-3.5" aria-hidden="true" />
        ) : (
          <DoorOpen className="size-3.5" aria-hidden="true" />
        )}
        {off ? t("hk.out_of_order") : occupied ? t("guestsN", { n: room.guests ?? 0 }) : t("free")}
      </span>
      <span className="flex items-center gap-1.5 text-[11px] font-medium">
        <span className={cn("size-2 shrink-0 rounded-full", HK_STYLE[h].dot)} aria-hidden="true" />
        <span className={cn("truncate", occupied ? "opacity-80" : "text-fg-muted")}>{t(`hk.${h}`)}</span>
      </span>
    </button>
  );
}

function RoomSheet({
  restaurantId,
  room,
  icons,
  timeZone,
  currency,
  canAct,
  canCheckOut,
  onClose,
}: {
  restaurantId: string;
  room: RoomView;
  icons: Record<string, string>;
  timeZone: string;
  currency: string;
  canAct: boolean;
  canCheckOut: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("hotel.rooms");
  const th = useTranslations("hotel");
  const tk = useTranslations("guest.waiter.kinds");
  const ts = useTranslations("orderStatus");
  const { pending, error, run } = useRun();
  const h = hk(room.housekeeping);
  const clock = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return (
    <Sheet title={t("roomN", { label: room.label })} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold",
              room.guests != null ? "bg-ink text-ink-fg" : "bg-surface-2 text-fg-muted",
            )}
          >
            <Users className="size-4" aria-hidden="true" />
            {room.guests != null ? t("guestsN", { n: room.guests }) : t("free")}
          </span>
          {room.since ? (
            <span className="text-fg-muted">
              {t("since")} <span dir="ltr">{clock(room.since)}</span>
            </span>
          ) : null}
          {room.todayCents ? (
            <span className="ms-auto font-semibold tabular-nums">
              {t("roomServiceToday")} {formatMoney(room.todayCents, currency)}
            </span>
          ) : null}
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t("housekeeping")}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {HK.map((v) => {
              const S = HK_STYLE[v];
              return (
                <button
                  key={v}
                  type="button"
                  disabled={!canAct || pending}
                  onClick={() => run(() => setHousekeepingAction(restaurantId, room.id, v))}
                  aria-pressed={h === v}
                  className={cn(
                    "inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold ring-1 transition-colors disabled:opacity-60",
                    h === v ? cn(S.chip, "ring-current") : "ring-border hover:bg-surface-2",
                  )}
                >
                  <S.Icon className="size-4 shrink-0" aria-hidden="true" />
                  {t(`hk.${v}`)}
                </button>
              );
            })}
          </div>
          {room.housekeepingAt ? (
            <p className="mt-1.5 text-xs text-fg-subtle">
              {t("updatedAt")} <span dir="ltr">{clock(room.housekeepingAt)}</span>
            </p>
          ) : null}
        </fieldset>

        <section>
          <h3 className="mb-2 text-sm font-semibold">{t("requests")}</h3>
          {room.requests.length ? (
            <ul className="space-y-2">
              {room.requests.map((q) => {
                const Icon = CALL_ICON[icons[q.kind] ?? "bell"] ?? BellRing;
                return (
                  <li key={q.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-center gap-2">
                      <Icon className="size-4 text-accent-text" aria-hidden="true" />
                      <span className="flex-1 font-semibold">
                        {q.label ?? (tk.has(q.kind as "waiter") ? tk(q.kind as "waiter") : q.kind)}
                      </span>
                      <span className="text-xs text-fg-muted" dir="ltr">
                        {clock(q.createdAt)}
                      </span>
                    </div>
                    {q.note ? <p className="mt-1.5 text-sm text-fg-muted">{q.note}</p> : null}
                    {canAct ? (
                      <div className="mt-2 flex gap-2">
                        {q.status === "open" ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => moveRequestAction(restaurantId, q.id, "in_progress"))}
                            className="h-9 flex-1 rounded-lg bg-accent text-sm font-bold text-accent-fg disabled:opacity-50"
                          >
                            {th("take")}
                          </button>
                        ) : (
                          <span className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-warning-soft text-sm font-semibold text-warning">
                            {th("status.in_progress")}
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => moveRequestAction(restaurantId, q.id, "done"))}
                          className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg text-sm font-bold ring-1 ring-border disabled:opacity-50"
                        >
                          <Check className="size-4" aria-hidden="true" />
                          {th("done")}
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-xl bg-surface-2 px-3 py-3 text-sm text-fg-muted">{t("noRequests")}</p>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">{t("roomService")}</h3>
          {room.orders.length ? (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {room.orders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/dashboard/${restaurantId}/orders`}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-surface-2"
                  >
                    <span className="font-bold tabular-nums">#{o.number}</span>
                    <span className="flex-1 text-fg-muted">{ts(o.status as "received")}</span>
                    <span className="font-semibold tabular-nums">{formatMoney(o.totalCents, currency)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-surface-2 px-3 py-3 text-sm text-fg-muted">{t("noOrders")}</p>
          )}
        </section>

        {error ? <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/${restaurantId}/tables`}
            className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold ring-1 ring-border hover:bg-surface-2"
          >
            <QrCode className="size-4" aria-hidden="true" />
            {t("qr")}
          </Link>
          {canCheckOut && room.guests != null ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                window.confirm(t("checkOutConfirm", { label: room.label })) &&
                run(() => checkOutRoomAction(restaurantId, room.id))
              }
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-ink text-sm font-bold text-ink-fg disabled:opacity-50"
            >
              <LogOut className="size-4" aria-hidden="true" />
              {t("checkOut")}
            </button>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
