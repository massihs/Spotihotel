import { Suspense } from "react";
import { formatMoney } from "@/lib/money";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, getLocale } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { BlockParticipantButton, ConfirmTableButton } from "@/components/dashboard/guest-safety-buttons";
import { OrderCard } from "@/components/dashboard/order-card";
import { CloseTableButton } from "@/components/dashboard/close-table-button";
import { LiveRefresh } from "@/components/realtime/live";
import { Card, StatCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { can } from "@/server/tenancy";
import { getTableOverview } from "@/server/modules/orders/service";
import { getPaymentMethods, listSessionPayments } from "@/server/modules/payments/service";
import { CancelPendingButton, CollectPaymentDialog } from "@/components/dashboard/payment-dialogs";

type Params = PageProps<"/[locale]/dashboard/[restaurantId]/tables/[tableId]">["params"];

export default function TableDetailPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <TableDetail params={params} />
    </Suspense>
  );
}

async function TableDetail({ params }: { params: Params }) {
  const { restaurantId, tableId } = await params;
  const ctx = await requireRestaurant(restaurantId, "tables.view");
  let view: Awaited<ReturnType<typeof getTableOverview>>;
  try {
    view = await getTableOverview(db, ctx, tableId);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const canCollect = can(ctx, "payments.record");
  const [t, format, methods, sessionPayments] = await Promise.all([
    getTranslations(),
    getFormatter(),
    getPaymentMethods(db, ctx.restaurant.id),
    view.session && can(ctx, "payments.view") ? listSessionPayments(db, ctx, view.session.id) : [],
  ]);
  const locale = await getLocale();
  const payable = (orders: (typeof view.participants)[number]["orders"]) =>
    orders
      .filter((o) => o.status !== "cancelled" && o.paymentStatus === "unpaid")
      .reduce((s, o) => s + o.totalCents, 0);
  const tablePayable = view.participants.reduce((s, p) => s + payable(p.orders), 0);
  const inFlight = sessionPayments.filter((p) => p.status === "pending" || p.status === "requires_action");
  const collected = sessionPayments
    .filter((p) => p.status === "succeeded" || p.status === "partially_refunded")
    .reduce((s, p) => s + p.amountCents - p.refundedCents, 0);
  const money = (c: number) => formatMoney(c, ctx.restaurant.currency, locale);
  const orderCount = view.participants.reduce((n, p) => n + p.orders.length, 0);

  return (
    <>
      <LiveRefresh
        types={["order.created", "order.updated", "session.opened", "session.closed", "payment.updated"]}
      />
      <Link href={`/dashboard/${ctx.restaurant.id}/tables`} className="text-sm text-fg-muted hover:text-fg">
        ← {t("tableView.back")}
      </Link>
      <div className="mt-2">
        <PageHeader
          title={t(view.table.kind === "room" ? "tableView.titleRoom" : "tableView.title", {
            label: view.table.label,
          })}
          description={
            view.session
              ? t("tableView.since", { time: format.relativeTime(view.session.openedAt) })
              : t("tableView.freeBody")
          }
          actions={
            view.session ? (
              <div className="flex flex-wrap items-start gap-2">
                {!view.session.confirmedAt && can(ctx, "orders.update_status") ? (
                  <ConfirmTableButton restaurantId={ctx.restaurant.id} tableId={view.table.id} size="md" />
                ) : null}
                {canCollect && tablePayable > 0 ? (
                  <CollectPaymentDialog
                    restaurantId={ctx.restaurant.id}
                    tableSessionId={view.session.id}
                    participantId={null}
                    amountCents={tablePayable}
                    currency={ctx.restaurant.currency}
                    methods={methods.offline}
                    title={t("payments.collectTable", { label: view.table.label })}
                    size="md"
                  />
                ) : null}
                {can(ctx, "sessions.close") ? (
                  <CloseTableButton
                    restaurantId={ctx.restaurant.id}
                    tableId={view.table.id}
                    label={view.table.label}
                    canForce={can(ctx, "restaurant.manage")}
                    size="md"
                  />
                ) : null}
              </div>
            ) : null
          }
        />
      </div>
      {!view.session ? (
        <Card className="px-6 py-14 text-center">
          <h2 className="text-lg font-semibold">{t("tableView.free")}</h2>
        </Card>
      ) : (
        <>
          {!view.session.confirmedAt ? (
            <p className="mb-4 rounded-xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
              {t("safety.waitingBody")}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label={t("tableView.tableTotal")} value={money(view.tableTotalCents)} />
            <StatCard
              label={t("tableView.unpaid")}
              value={money(view.unpaidCents)}
              hint={collected > 0 ? t("payments.collectedSoFar", { amount: money(collected) }) : undefined}
            />
            <StatCard
              label={t("tableView.people", { count: view.participants.length })}
              value={t("tableView.orders", { count: orderCount })}
            />
          </div>
          {inFlight.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {inFlight.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-accent-soft px-4 py-2.5 text-sm text-accent-text"
                >
                  <span>
                    {t("payments.onlineInProgress", { amount: money(p.amountCents) })}
                    {p.participantId
                      ? ` · ${t("orders.client", { n: view.participants.find((x) => x.id === p.participantId)?.seq ?? 0 })}`
                      : ""}
                  </span>
                  {canCollect ? (
                    <CancelPendingButton restaurantId={ctx.restaurant.id} paymentId={p.id} />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-6 space-y-6">
            {view.participants.map((p) => (
              <section key={p.id} aria-labelledby={`p-${p.id}`}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                  <h2 id={`p-${p.id}`} className="text-lg font-semibold">
                    {p.displayName ? `${p.displayName} · ` : ""}
                    {t("orders.client", { n: p.seq })}
                  </h2>
                  <p className="text-sm">
                    {t("tableView.clientTotal")}{" "}
                    <span className="font-semibold tabular-nums">{money(p.totalCents)}</span>
                    {p.unpaidCents ? (
                      <span className="text-fg-muted">
                        {" "}
                        · {t("tableView.unpaid")} {money(p.unpaidCents)}
                      </span>
                    ) : p.totalCents > 0 ? (
                      <span className="text-success"> · ✓ {t("paymentStatus.paid")}</span>
                    ) : null}
                  </p>
                  {canCollect && payable(p.orders) > 0 ? (
                    <CollectPaymentDialog
                      restaurantId={ctx.restaurant.id}
                      tableSessionId={view.session!.id}
                      participantId={p.id}
                      amountCents={payable(p.orders)}
                      currency={ctx.restaurant.currency}
                      methods={methods.offline}
                      title={t("payments.collectFor", {
                        name: p.displayName ?? t("orders.client", { n: p.seq }),
                      })}
                      variant="secondary"
                    />
                  ) : null}
                  {can(ctx, "orders.cancel") ? (
                    <BlockParticipantButton
                      restaurantId={ctx.restaurant.id}
                      participantId={p.id}
                      name={p.displayName ?? t("orders.client", { n: p.seq })}
                    />
                  ) : null}
                </div>
                {p.orders.length === 0 ? (
                  <p className="text-sm text-fg-subtle">{t("tableView.noOrdersYet")}</p>
                ) : (
                  <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                    {p.orders.map((o) => (
                      <li key={o.id}>
                        <OrderCard
                          restaurantId={ctx.restaurant.id}
                          order={{ ...o, participantSeq: p.seq, participantName: p.displayName }}
                          canUpdate={can(ctx, "orders.update_status")}
                          canCancel={can(ctx, "orders.cancel")}
                          timeZone={ctx.restaurant.timezone}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
