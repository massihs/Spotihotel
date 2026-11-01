import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { CloseTableButton } from "@/components/dashboard/close-table-button";
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
  const money = (c: number) =>
    format.number(c / 100, { style: "currency", currency: ctx.restaurant.currency });
  const count = (s: TableState) => floor.filter((x) => x.state === s).length;
  const canClose = can(ctx, "sessions.close");
  const canForce = can(ctx, "restaurant.manage");
  const tz = ctx.restaurant.timezone;

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
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] items-start gap-3">
        {floor.map((tbl) => (
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
                <p className="text-2xl leading-none font-bold">{tbl.label}</p>
                <span className="text-lg" aria-hidden="true">
                  {STATE[tbl.state].emoji}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-fg-muted">{t(tbl.state)}</p>
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
            {canClose && tbl.state === "occupied" ? (
              <div className="mt-1.5 flex justify-end">
                <CloseTableButton
                  restaurantId={ctx.restaurant.id}
                  tableId={tbl.id}
                  label={tbl.label}
                  canForce={canForce}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
