import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/server/db/client";
import { getGuest } from "@/server/modules/guest/current";
import { listGuestOrders } from "@/server/modules/orders/service";
import { getGuestPaymentState, getGuestPaymentStatus } from "@/server/modules/payments/service";
import { PaymentPanel } from "@/components/guest/payment-panel";
import { SessionExpired, GuestSkeleton } from "@/components/guest/states";
import { LiveIndicator, LiveProvider, LiveRefresh } from "@/components/realtime/live";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

const STEPS = ["received", "accepted", "preparing", "ready", "served"] as const;

/** The guest cookie is per request: the page streams behind its own boundary (instant navigations). */
export default function GuestOrdersPage({ searchParams }: PageProps<"/[locale]/table/orders">) {
  return (
    <Suspense fallback={<GuestSkeleton />}>
      <GuestOrders searchParams={searchParams} />
    </Suspense>
  );
}

async function GuestOrders({ searchParams }: Pick<PageProps<"/[locale]/table/orders">, "searchParams">) {
  const guest = await getGuest();
  if (!guest) return <SessionExpired />;
  const [t, format, orders, sp, payState] = await Promise.all([
    getTranslations(),
    getFormatter(),
    listGuestOrders(db, guest),
    searchParams,
    getGuestPaymentState(db, guest),
  ]);
  const returned = typeof sp.payment === "string" ? await getGuestPaymentStatus(db, guest, sp.payment) : null;
  const money = (c: number) =>
    format.number(c / 100, { style: "currency", currency: guest.restaurant.currency });
  const total = orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.totalCents, 0);

  return (
    <LiveProvider url="/api/v1/realtime/guest">
      <LiveRefresh types={["order.updated", "session.closed", "payment.updated"]} />
      <main className="px-4 pb-24">
        <div className="flex items-center gap-3 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
          <Link
            href="/table"
            className="grid size-10 place-items-center rounded-full bg-surface-2"
            aria-label={t("guest.backToMenu")}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5 rtl:rotate-180"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-semibold">{t("guest.myOrders")}</h1>
            <LiveIndicator />
          </div>
        </div>

        {sp.placed ? (
          <p role="status" className="mb-4 rounded-2xl bg-success-soft px-4 py-3 font-medium text-success">
            ✓ {t("guest.orderPlaced")}
          </p>
        ) : null}

        {orders.length === 0 ? (
          <p className="py-16 text-center text-fg-muted">{t("guest.noOrders")}</p>
        ) : (
          <ul className="space-y-4">
            {orders.map((o) => {
              const stepIndex = STEPS.indexOf(o.status as (typeof STEPS)[number]);
              return (
                <li key={o.id} className="rounded-2xl border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{t("guest.orderNumber", { number: o.number })}</p>
                      <p className="text-sm text-fg-muted">
                        {t("guest.placedAt", {
                          time: format.dateTime(o.placedAt, {
                            timeStyle: "short",
                            timeZone: guest.restaurant.timezone,
                          }),
                        })}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-3 py-1 text-sm font-medium",
                        o.status === "ready"
                          ? "bg-success text-white"
                          : o.status === "cancelled"
                            ? "bg-danger-soft text-danger"
                            : "bg-accent-soft text-accent",
                      )}
                    >
                      {t(`orderStatus.${o.status}`)}
                    </span>
                  </div>
                  {stepIndex >= 0 ? (
                    <ol className="mt-4 grid grid-cols-5 gap-1" aria-label={t(`orderStatus.${o.status}`)}>
                      {STEPS.map((s, i) => (
                        <li
                          key={s}
                          className={cn("h-1.5 rounded-full", i <= stepIndex ? "bg-accent" : "bg-surface-2")}
                        >
                          <span className="sr-only">{t(`orderStatus.${s}`)}</span>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  <p className="mt-2 text-sm text-fg-muted">{t(`guest.statusHint.${o.status}`)}</p>
                  <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
                    {o.items.map((i) => (
                      <li key={i.id} className="flex justify-between gap-3">
                        <span>
                          <span className="font-medium tabular-nums">{i.quantity}×</span> {i.productName}
                          {i.options.length ? (
                            <span className="text-fg-muted">
                              {" "}
                              · {i.options.map((x) => x.valueName).join(", ")}
                            </span>
                          ) : null}
                          {i.note ? <span className="block text-xs text-fg-subtle">« {i.note} »</span> : null}
                        </span>
                        <span className="shrink-0 tabular-nums">{money(i.lineTotalCents)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 flex justify-between border-t border-border pt-3 font-semibold">
                    <span>
                      {t("guest.total")}
                      {o.paymentStatus !== "unpaid" && o.status !== "cancelled" ? (
                        <span className="ms-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg-muted">
                          {t(`paymentStatus.${o.paymentStatus}`)}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn("tabular-nums", o.status === "cancelled" && "line-through opacity-60")}
                    >
                      {money(o.totalCents)}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {orders.length > 0 ? (
          <dl className="mt-5 space-y-1 rounded-2xl bg-surface-2 p-4 text-sm">
            <div className="flex justify-between">
              <dt>{t("guest.yourTotal")}</dt>
              <dd className="font-semibold tabular-nums">{money(total)}</dd>
            </div>
          </dl>
        ) : null}

        {orders.length > 0 ? (
          <PaymentPanel
            state={payState}
            currency={guest.restaurant.currency}
            returned={returned?.status ?? null}
          />
        ) : null}

        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Link
            href="/table"
            className="flex h-14 items-center justify-center rounded-2xl bg-fg font-semibold text-bg shadow-2xl"
          >
            {t("guest.orderAgain")}
          </Link>
        </div>
      </main>
    </LiveProvider>
  );
}
