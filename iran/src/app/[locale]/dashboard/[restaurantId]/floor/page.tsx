import { Suspense } from "react";
import { BedDouble } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { getFormatter, getTranslations, getLocale } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { CloseTableButton } from "@/components/dashboard/close-table-button";
import { MoveTableButton } from "@/components/dashboard/move-table-button";
import { ConfirmTableButton } from "@/components/dashboard/guest-safety-buttons";
import { LiveIndicator, LiveRefresh } from "@/components/realtime/live";
import { TimeAgo } from "@/components/ui/time-ago";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { getFloor, type TableState } from "@/server/modules/floor/service";

type Params = PageProps<"/[locale]/dashboard/[restaurantId]/floor">["params"];

const STATE: Record<TableState, { dot: string; tile: string; emoji: string }> = {
  free: { dot: "bg-success", tile: "border-success/40", emoji: "🟢" },
  in_progress: { dot: "bg-warning", tile: "border-warning bg-warning-soft/40", emoji: "🟡" },
  occupied: { dot: "bg-danger", tile: "border-danger/50 bg-danger-soft/30", emoji: "🔴" },
};

export default function FloorPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface-2" />}>
      <Floor params={params} />
    </Suspense>
  );
}

async function Floor({ params }: { params: Params }) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "tables.view");
  const [t, format, floor] = await Promise.all([getTranslations("floor"), getFormatter(), getFloor(db, ctx)]);
  const locale = await getLocale();
  const money = (c: number) => formatMoney(c, ctx.restaurant.currency, locale);
  const count = (s: TableState) => floor.filter((x) => x.state === s).length;
  const canClose = can(ctx, "sessions.close");
  const canForce = can(ctx, "restaurant.manage");
  const canConfirm = can(ctx, "orders.update_status");
  const tz = ctx.restaurant.timezone;
  const rooms = floor.filter((x) => x.kind === "room");
  const groups =
    rooms.length && rooms.length < floor.length
      ? [
          { key: "room", title: t("rooms"), list: rooms },
          { key: "table", title: t("tables"), list: floor.filter((x) => x.kind !== "room") },
        ]
      : [{ key: "all", title: rooms.length ? t("rooms") : null, list: floor }];

  return (
    <>
      <LiveRefresh types={["order.created", "order.updated", "session.opened", "session.closed"]} />
      <PageHeader
        title={t("title")}
        description={t("summary", {
          free: count("free"),
          inProgress: count("in_progress"),
          occupied: count("occupied"),
        })}
        actions={
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <LiveIndicator />
            {(["free", "in_progress", "occupied"] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-fg-muted">
                <span className={cn("size-2.5 rounded-full", STATE[s].dot)} aria-hidden="true" />
                {t(s)}
              </span>
            ))}
          </div>
        }
      />
      {groups.map((group) => (
        <section key={group.key} className="mb-6">
          {group.title ? (
            <h2 className="mb-2.5 flex items-center gap-2 font-bold">
              {group.key === "room" ? (
                <BedDouble className="size-4 text-accent-text" aria-hidden="true" />
              ) : null}
              {group.title}
            </h2>
          ) : null}
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] items-start gap-3">
            {group.list.map((tbl) => (
              <li key={tbl.id} className="flex flex-col">
                <Link
                  href={`/dashboard/${ctx.restaurant.id}/tables/${tbl.id}`}
                  className={cn(
                    "flex flex-1 flex-col rounded-2xl border-2 bg-surface p-3 transition-shadow hover:shadow-lg",
                    STATE[tbl.state].tile,
                  )}
                  aria-label={`${tbl.label} — ${t(tbl.state)}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-2xl leading-none font-bold">
                      {tbl.kind === "room" ? (
                        <BedDouble className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
                      ) : null}
                      {tbl.label}
                    </p>
                    <span className="text-lg" aria-hidden="true">
                      {STATE[tbl.state].emoji}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-fg-muted">{t(tbl.state)}</p>
                  {tbl.waiting ? (
                    <p className="mt-1.5 inline-flex w-fit rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">
                      {t("waitingConfirm")}
                    </p>
                  ) : null}
                  {tbl.state === "free" ? (
                    <p className="mt-auto pt-3 text-xs text-fg-subtle">{tbl.zone ?? " "}</p>
                  ) : (
                    <dl className="mt-3 space-y-0.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-fg-muted">{t("people", { count: tbl.people })}</dt>
                        <dd>
                          <TimeAgo date={tbl.openedAt!} timeZone={tz} />
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-fg-muted">{t("orders", { count: tbl.ordersCount })}</dt>
                        <dd className="font-semibold tabular-nums">{money(tbl.totalCents)}</dd>
                      </div>
                      {tbl.unpaidCents > 0 ? (
                        <div className="flex justify-between gap-2">
                          <dt className="text-fg-muted">{t("toCollect")}</dt>
                          <dd className="tabular-nums">{money(tbl.unpaidCents)}</dd>
                        </div>
                      ) : null}
                      {tbl.readyOrders > 0 ? (
                        <p className="pt-1 font-semibold text-success">
                          {t("ready", { count: tbl.readyOrders })}
                        </p>
                      ) : null}
                      {tbl.lastOrderAt ? (
                        <p className="pt-1 text-fg-subtle">
                          {t("lastOrder", {
                            time: format.dateTime(tbl.lastOrderAt, { timeStyle: "short", timeZone: tz }),
                          })}
                        </p>
                      ) : null}
                    </dl>
                  )}
                </Link>
                {tbl.waiting && canConfirm ? (
                  <div className="mt-1.5 flex justify-end">
                    <ConfirmTableButton restaurantId={ctx.restaurant.id} tableId={tbl.id} />
                  </div>
                ) : null}
                {canClose && tbl.state !== "free" ? (
                  <div className="mt-1.5 flex items-start justify-end gap-2">
                    <MoveTableButton
                      restaurantId={ctx.restaurant.id}
                      tableId={tbl.id}
                      freeTables={floor
                        .filter((x) => x.state === "free")
                        .map((x) => ({ id: x.id, label: x.label }))}
                    />
                    {tbl.state === "occupied" ? (
                      <CloseTableButton
                        restaurantId={ctx.restaurant.id}
                        tableId={tbl.id}
                        label={tbl.label}
                        canForce={canForce}
                        room={tbl.kind === "room"}
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
