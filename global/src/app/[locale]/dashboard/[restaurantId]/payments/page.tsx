import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { RefundDialog } from "@/components/dashboard/payment-dialogs";
import { LiveRefresh } from "@/components/realtime/live";
import { Badge } from "@/components/ui/badge";
import { Card, StatCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { listPayments, type PAYMENT_STATUSES } from "@/server/modules/payments/service";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/payments">;
type Status = (typeof PAYMENT_STATUSES)[number];

const VIEWS: Record<string, Status[] | undefined> = {
  all: undefined,
  succeeded: ["succeeded"],
  refunded: ["partially_refunded", "refunded"],
  failed: ["failed", "cancelled"],
  pending: ["pending", "requires_action"],
};

const TONE: Record<Status, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  pending: "accent",
  requires_action: "accent",
  succeeded: "success",
  failed: "danger",
  cancelled: "neutral",
  refunded: "warning",
  partially_refunded: "warning",
};

export default function PaymentsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Payments params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Payments({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "payments.view");
  const sp = await searchParams;
  const view = typeof sp.view === "string" && sp.view in VIEWS ? sp.view : "all";
  const [t, format, list] = await Promise.all([
    getTranslations(),
    getFormatter(),
    listPayments(db, ctx, { statuses: VIEWS[view], limit: 100 }),
  ]);
  const money = (c: number) =>
    format.number(c / 100, { style: "currency", currency: ctx.restaurant.currency });
  const settled = list.filter((p) => ["succeeded", "partially_refunded", "refunded"].includes(p.status));
  const net = settled.reduce((s, p) => s + p.amountCents - p.refundedCents, 0);
  const refunded = settled.reduce((s, p) => s + p.refundedCents, 0);
  const canRefund = can(ctx, "payments.refund");
  const base = `/dashboard/${ctx.restaurant.id}/payments`;

  return (
    <>
      <LiveRefresh types={["payment.updated"]} />
      <PageHeader title={t("payments.title")} description={t("payments.subtitle")} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("payments.statNet")} value={money(net)} hint={t("payments.statHint")} />
        <StatCard label={t("payments.statRefunded")} value={money(refunded)} />
        <StatCard label={t("payments.statCount")} value={format.number(settled.length)} />
      </div>
      <nav className="mb-5 flex flex-wrap gap-2" aria-label={t("payments.title")}>
        {Object.keys(VIEWS).map((key) => (
          <Link
            key={key}
            href={key === "all" ? base : `${base}?view=${key}`}
            aria-current={view === key ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium",
              view === key ? "bg-fg text-bg" : "bg-surface-2 text-fg-muted",
            )}
          >
            {t(`payments.view.${key}`)}
          </Link>
        ))}
      </nav>
      {list.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <h2 className="text-lg font-semibold">{t("payments.empty")}</h2>
          <p className="mx-auto mt-1 max-w-sm text-fg-muted">{t("payments.emptyBody")}</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b border-border text-start text-xs text-fg-muted uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("payments.col.date")}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("payments.col.table")}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("payments.col.method")}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("payments.col.orders")}
                </th>
                <th scope="col" className="px-4 py-3 text-end font-medium">
                  {t("payments.col.amount")}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("payments.col.status")}
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">{t("common.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((p) => {
                const refundable = p.amountCents - p.refundedCents;
                return (
                  <tr key={p.id} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                      {format.dateTime(p.succeededAt ?? p.createdAt, {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: ctx.restaurant.timezone,
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {p.tableLabel ? t("payments.tableLabel", { label: p.tableLabel }) : "—"}
                      <span className="block text-xs text-fg-muted">
                        {p.participantSeq
                          ? `${p.participantName ? `${p.participantName} · ` : ""}${t("orders.client", { n: p.participantSeq })}`
                          : t("payments.wholeTable")}
                      </span>
                    </td>
                    <td className="px-4 py-3">{t(`payments.provider.${p.provider}`)}</td>
                    <td className="px-4 py-3 text-fg-muted">{p.orderNumbers.join(", ")}</td>
                    <td className="px-4 py-3 text-end tabular-nums">
                      <span className="font-semibold">{money(p.amountCents)}</span>
                      {p.refundedCents > 0 ? (
                        <span className="block text-xs text-danger">−{money(p.refundedCents)}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={TONE[p.status]}>{t(`payments.status.${p.status}`)}</Badge>
                      {p.refunds.map((r) => (
                        <span key={r.id} className="mt-1 block text-xs text-fg-muted">
                          {t("payments.refundLine", { amount: money(r.amountCents) })}
                          {r.status !== "succeeded" ? ` (${t(`payments.refundStatus.${r.status}`)})` : ""}
                          {r.reason ? ` · ${r.reason}` : ""}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-3 text-end">
                      {canRefund &&
                      refundable > 0 &&
                      (p.status === "succeeded" || p.status === "partially_refunded") ? (
                        <RefundDialog
                          restaurantId={ctx.restaurant.id}
                          paymentId={p.id}
                          refundableCents={refundable}
                          currency={ctx.restaurant.currency}
                        />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
