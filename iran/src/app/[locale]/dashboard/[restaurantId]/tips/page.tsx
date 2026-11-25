import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { HandCoins, Heart, Wallet } from "lucide-react";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Empty } from "@/components/ui/empty";
import { PeriodForm } from "@/components/pms/desk-table";
import { periodOf } from "@/components/hotel/service-module";
import { jalaliDateTime } from "@/lib/jalali";
import { getMoney } from "@/lib/money-server";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { tipsReport } from "@/server/modules/pms/tips";
import { PayOutButton } from "./pay-out-button";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/tips">;

export default function TipsPage(props: Props) {
  return (
    <Suspense fallback={<div className="skeleton h-80 rounded-2xl" />}>
      <Tips {...props} />
    </Suspense>
  );
}

/** انعام کارکنان: what guests left to each member of staff, and what is still to hand over. */
async function Tips({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "folio.post");
  const period = await periodOf(ctx, await searchParams, 29);
  const tz = ctx.restaurant.timezone;
  const [t, money, r] = await Promise.all([
    getTranslations("tipsAdmin"),
    getMoney(ctx.restaurant.currency),
    tipsReport(db, ctx, new Date(`${period.from}T00:00:00Z`), new Date(`${period.to}T23:59:59Z`)),
  ]);
  await getLocale();
  const rid = ctx.restaurant.id;
  const total = r.staff.reduce((s, x) => s + x.totalCents, 0);
  const unpaid = r.staff.reduce((s, x) => s + x.unpaidCents, 0);
  const canPay = can(ctx, "folio.adjust");
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <PeriodForm base={`/dashboard/${rid}/tips`} tab="" from={period.from} to={period.to} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          tone="gradient"
          label={t("total")}
          value={money(total)}
          icon={<HandCoins className="size-5" />}
        />
        <StatCard
          label={t("unpaid")}
          value={money(unpaid)}
          icon={<Wallet className="size-5" />}
          progress={total ? (unpaid / total) * 100 : 0}
        />
        <StatCard
          label={t("count")}
          value={r.recent.length}
          icon={<Heart className="size-5" aria-hidden="true" />}
        />
      </div>
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title={t("byStaff")} count={r.staff.length} description={t("byStaffHint")} />
          {r.staff.length ? (
            <ul className="divide-y divide-border">
              {r.staff.map((s) => (
                <li key={s.userId} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <Avatar name={s.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{s.name}</span>
                    <span className="block text-xs text-fg-muted">
                      {t("tipsCount", { n: s.count })} · {money(s.totalCents)}
                    </span>
                  </span>
                  {s.unpaidCents > 0 ? (
                    <>
                      <span className="font-bold text-warning tabular-nums">{money(s.unpaidCents)}</span>
                      {canPay ? (
                        <PayOutButton rid={rid} staffUserId={s.userId} amount={money(s.unpaidCents)} />
                      ) : null}
                    </>
                  ) : (
                    <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
                      {t("allPaid")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 sm:p-5">
              <Empty icon={<HandCoins aria-hidden="true" />}>{t("none")}</Empty>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title={t("recent")} count={r.recent.length} />
          {r.recent.length ? (
            <ul className="divide-y divide-border">
              {r.recent.map((x) => (
                <li key={x.id} className="px-5 py-3">
                  <p className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{x.staff}</span>
                    <span className="font-bold tabular-nums">{money(x.amountCents)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {x.room ? `${t("room", { room: x.room })} · ` : ""}
                    <span dir="ltr">{jalaliDateTime(x.at, tz)}</span>
                    {x.paid ? ` · ${t("paid")}` : ""}
                  </p>
                  {x.message ? (
                    <p className="mt-1.5 rounded-xl bg-surface-2 px-3 py-2 text-sm">«{x.message}»</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 sm:p-5">
              <Empty size="sm" icon={<Heart aria-hidden="true" />}>
                {t("none")}
              </Empty>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
