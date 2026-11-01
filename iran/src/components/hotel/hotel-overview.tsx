import {
  ArrowRight,
  BedDouble,
  BellRing,
  Clock,
  ConciergeBell,
  ReceiptText,
  SprayCan,
  Timer,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { CALL_ICON } from "@/components/guest/call-icons";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { db } from "@/server/db/client";
import type { RestaurantContext } from "@/server/tenancy";
import { listRequests, type hotelToday } from "@/server/modules/hotel/requests";
import { roomsBoard } from "@/server/modules/hotel/rooms";
import { guestCallsOf } from "@/server/modules/team/sections";

const HK_DOT: Record<string, string> = {
  clean: "bg-success",
  dirty: "bg-danger",
  cleaning: "bg-warning",
  inspected: "bg-info",
  out_of_order: "bg-fg-subtle",
};

/**
 * A hotel's home: occupancy and room service on a navy card, the day's service numbers, every
 * floor at a glance and the requests waiting on someone.
 */
export async function HotelOverview({
  ctx,
  today,
  money,
  asOf,
}: {
  ctx: RestaurantContext;
  /** When the page was computed (waiting times count from it). */
  asOf: Date;
  today: Awaited<ReturnType<typeof hotelToday>>;
  money: (cents: number) => string;
}) {
  const base = `/dashboard/${ctx.restaurant.id}`;
  const [t, tk, board, requests, options] = await Promise.all([
    getTranslations("dashboard.hotel"),
    getTranslations("guest.waiter.kinds"),
    roomsBoard(db, ctx),
    listRequests(db, ctx),
    guestCallsOf(db, ctx.restaurant.id, { room: true }),
  ]);
  const inService = Math.max(0, today.rooms - today.outOfOrder);
  const rate = inService ? Math.round((today.occupied / inService) * 100) : 0;
  const waiting = requests.filter((r) => r.status !== "done").slice(0, 6);
  const icons = Object.fromEntries(options.map((o) => [o.key, o.icon]));
  const name = (r: { kind: string; label: string | null }) =>
    r.label ?? (tk.has(r.kind as "waiter") ? tk(r.kind as "waiter") : r.kind);
  const now = asOf.getTime();

  return (
    <>
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden border-transparent bg-ink p-6 text-ink-fg shadow-[var(--shadow-float)]">
          <div
            className="pointer-events-none absolute -end-20 -top-24 size-72 rounded-full bg-white/[0.06]"
            aria-hidden="true"
          />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium opacity-75">{t("occupancy")}</p>
              <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">{rate}%</p>
              <p className="mt-1 text-sm opacity-80">
                {t("occupiedOf", { n: today.occupied, total: inService })}
              </p>
            </div>
            <span
              className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/12"
              aria-hidden="true"
            >
              <BedDouble className="size-5" />
            </span>
          </div>
          <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-accent" style={{ width: `${rate}%` }} />
          </div>
          <dl className="relative mt-6 grid grid-cols-3 gap-4 border-t border-white/12 pt-5 text-sm">
            <div>
              <dt className="opacity-70">{t("roomServiceRevenue")}</dt>
              <dd className="mt-1 text-lg font-bold tabular-nums">{money(today.roomServiceCents)}</dd>
            </div>
            <div>
              <dt className="opacity-70">{t("avgResponse")}</dt>
              <dd className="mt-1 text-lg font-bold tabular-nums">
                {today.avgResponseMin == null ? "—" : t("minutes", { n: today.avgResponseMin })}
              </dd>
            </div>
            <div>
              <dt className="opacity-70">{t("outOfOrder")}</dt>
              <dd className="mt-1 text-lg font-bold tabular-nums">{today.outOfOrder}</dd>
            </div>
          </dl>
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <Link
            href={`${base}/requests`}
            className="block rounded-[var(--radius-card)] focus-visible:outline-none"
          >
            <StatCard
              label={t("open")}
              value={today.open}
              hint={t("inProgress", { n: today.inProgress })}
              icon={<ConciergeBell />}
              tone={today.open ? "rose" : "orange"}
            />
          </Link>
          <Link
            href={`${base}/rooms`}
            className="block rounded-[var(--radius-card)] focus-visible:outline-none"
          >
            <StatCard
              label={t("toClean")}
              value={today.dirty}
              hint={t("cleaningN", { n: today.cleaning })}
              icon={<SprayCan />}
              tone="amber"
            />
          </Link>
          <Link
            href={`${base}/orders`}
            className="block rounded-[var(--radius-card)] focus-visible:outline-none"
          >
            <StatCard label={t("roomOrders")} value={today.roomOrders} icon={<ReceiptText />} tone="sky" />
          </Link>
          <Link
            href={`${base}/requests`}
            className="block rounded-[var(--radius-card)] focus-visible:outline-none"
          >
            <StatCard label={t("doneToday")} value={today.doneToday} icon={<Timer />} tone="emerald" />
          </Link>
        </div>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="flex flex-col">
          <CardHeader
            title={t("floors")}
            action={
              <Link
                href={`${base}/rooms`}
                className="inline-flex items-center gap-1 text-sm font-semibold text-accent-text hover:underline"
              >
                {t("allRooms")}
                <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
              </Link>
            }
          />
          {board.rooms.length ? (
            <div className="space-y-3 p-5 pt-0">
              {board.floors.map((f) => {
                const list = board.rooms.filter((r) => r.floor.key === f.key);
                return (
                  <div key={f.key} className="flex items-start gap-3">
                    <span className="w-16 shrink-0 pt-1 text-xs font-semibold text-fg-muted">
                      {f.label == null
                        ? t("other")
                        : typeof f.label === "number"
                          ? f.label === 0
                            ? t("ground")
                            : t("floorN", { n: f.label })
                          : f.label}
                    </span>
                    <div className="flex flex-1 flex-wrap gap-1.5">
                      {list.map((r) => (
                        <Link
                          key={r.id}
                          href={`${base}/rooms`}
                          title={r.label}
                          className={cn(
                            "relative grid h-8 min-w-11 place-items-center rounded-lg px-1.5 text-xs font-bold tabular-nums ring-1",
                            r.session
                              ? "bg-ink text-ink-fg ring-ink"
                              : "bg-surface-2 text-fg-muted ring-border",
                            r.requests.length > 0 && "ring-2 ring-danger",
                          )}
                        >
                          {r.label}
                          <span
                            className={cn(
                              "absolute -end-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-surface",
                              HK_DOT[r.housekeeping] ?? HK_DOT.clean,
                            )}
                            aria-hidden="true"
                          />
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="m-5 mt-0 rounded-2xl bg-surface-2 p-4 text-sm text-fg-muted">{t("noRooms")}</p>
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title={t("waitingTitle")}
            action={
              <Link
                href={`${base}/requests`}
                className="inline-flex items-center gap-1 text-sm font-semibold text-accent-text hover:underline"
              >
                {t("requests")}
                <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
              </Link>
            }
          />
          {waiting.length ? (
            <ul className="divide-y divide-border px-2 pb-2">
              {waiting.map((r) => {
                const Icon = CALL_ICON[icons[r.kind] ?? "bell"] ?? BellRing;
                const min = Math.max(0, Math.floor((now - r.createdAt.getTime()) / 60_000));
                return (
                  <li key={r.id}>
                    <Link
                      href={`${base}/requests`}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-sm font-black text-ink-fg tabular-nums">
                        {r.placeLabel}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-semibold">
                          <Icon className="size-4 shrink-0 text-accent-text" aria-hidden="true" />
                          <span className="truncate">{name(r)}</span>
                        </span>
                        {r.note ? (
                          <span className="block truncate text-xs text-fg-muted">{r.note}</span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums",
                          r.status === "open" && min >= 10 ? "text-danger" : "text-fg-muted",
                        )}
                      >
                        <Clock className="size-3.5" aria-hidden="true" />
                        {t("minutes", { n: min })}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="m-5 mt-0 rounded-2xl bg-surface-2 p-4 text-sm text-fg-muted">{t("noWaiting")}</p>
          )}
        </Card>
      </section>
    </>
  );
}
