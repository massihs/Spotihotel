import {
  Check,
  ChefHat,
  CircleCheck,
  ConciergeBell,
  Plus,
  ReceiptText,
  Salad,
  Smartphone,
  Utensils,
} from "lucide-react";
import { Suspense } from "react";
import { menuThemeOf } from "@/lib/menu-themes";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { GuestTopBar } from "@/components/guest/cart-view";
import { PaymentPanel } from "@/components/guest/payment-panel";
import { ReadyWatcher } from "@/components/guest/ready-watcher";
import { PushButton } from "@/components/push/push-button";
import { vapidPublicKey } from "@/server/modules/push/service";
import { GuestSkeleton, SessionExpired } from "@/components/guest/states";
import { LiveIndicator, LiveProvider, LiveRefresh } from "@/components/realtime/live";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { db } from "@/server/db/client";
import { getCurrentDiner } from "@/server/auth/diner";
import { getGuest } from "@/server/modules/guest/current";
import { listGuestOrders } from "@/server/modules/orders/service";
import { getGuestPaymentState, getGuestPaymentStatus } from "@/server/modules/payments/service";

const STEPS = [
  { key: "received", Icon: ReceiptText },
  { key: "accepted", Icon: Check },
  { key: "preparing", Icon: ChefHat },
  { key: "ready", Icon: ConciergeBell },
  { key: "served", Icon: Utensils },
] as const;

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
  const [t, format, orders, sp, payState, locale] = await Promise.all([
    getTranslations(),
    getFormatter(),
    listGuestOrders(db, guest),
    searchParams,
    getGuestPaymentState(db, guest),
    getLocale(),
  ]);
  const diner = await getCurrentDiner();
  const returned = typeof sp.payment === "string" ? await getGuestPaymentStatus(db, guest, sp.payment) : null;
  const money = (c: number) => formatMoney(c, guest.restaurant.currency, locale);
  const total = orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.totalCents, 0);

  const pushKey = vapidPublicKey();
  return (
    <LiveProvider url="/api/v1/realtime/guest">
      <div data-brand={guest.restaurant.brandColor} className="contents">
        <div data-menu-theme={menuThemeOf(guest.restaurant.menuTheme)}>
          <LiveRefresh types={["order.updated", "session.closed", "payment.updated"]} />
          <GuestTopBar
            title={t("guest.myOrders")}
            subtitle={`${guest.restaurant.name} · ${t(guest.table.kind === "room" ? "guest.tableBadgeRoom" : "guest.tableBadge", { table: guest.table.label })}`}
            extra={<LiveIndicator className="rounded-full bg-surface-2 px-3 py-1.5" />}
          />
          <main className="mx-auto max-w-2xl px-4 pt-4 pb-32 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-x-6 lg:pt-6 lg:pb-12">
            {orders.length > 0 ? <ReadyWatcher /> : null}
            {orders.length > 0 && pushKey ? (
              <div className="mb-4 lg:col-span-2">
                <PushButton publicKey={pushKey} className="w-full" />
              </div>
            ) : null}
            {sp.placed ? (
              <div
                role="status"
                className="animate-pop-in mb-4 flex items-center gap-3 rounded-2xl border border-accent/25 bg-accent-soft p-4 lg:col-span-2"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
                  <CircleCheck className="size-7" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-lg font-semibold">{t("guest.sentTitle")}</p>
                  <p className="text-sm text-fg-muted">{t("guest.sentBody")}</p>
                </div>
              </div>
            ) : null}

            {orders.length === 0 ? (
              <div className="py-16 text-center lg:col-span-2">
                <div className="mx-auto grid size-20 place-items-center rounded-full bg-surface-2">
                  <ReceiptText className="size-9 text-fg-muted" aria-hidden="true" />
                </div>
                <p className="mt-5 text-lg font-bold">{t("guest.noOrders")}</p>
                <Link
                  href="/table"
                  className="mt-7 inline-flex h-12 items-center rounded-full bg-accent px-7 font-bold text-accent-fg"
                >
                  {t("guest.backToMenu")}
                </Link>
              </div>
            ) : (
              <ul className="space-y-4">
                {orders.map((o) => {
                  const stepIndex = STEPS.findIndex((s) => s.key === o.status);
                  return (
                    <li
                      key={o.id}
                      className={cn(
                        "rounded-2xl border bg-surface p-4 shadow-[var(--shadow-soft)]",
                        o.status === "ready" ? "border-accent ring-4 ring-accent/15" : "border-border",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold">
                            {t("guest.orderNumber", { number: o.number })}
                          </p>
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
                            "shrink-0 rounded-full px-3 py-1.5 text-sm font-bold",
                            o.status === "ready" || o.status === "served"
                              ? "bg-accent text-accent-fg"
                              : o.status === "cancelled"
                                ? "bg-danger-soft text-danger"
                                : "bg-accent-soft text-accent-text",
                          )}
                        >
                          {t(`orderStatus.${o.status}`)}
                        </span>
                      </div>

                      {stepIndex >= 0 ? (
                        <ol className="mt-5 flex items-start" aria-label={t("guest.trackTitle")}>
                          {STEPS.map(({ key, Icon }, i) => {
                            const done = i < stepIndex;
                            const current = i === stepIndex;
                            return (
                              <li
                                key={key}
                                aria-current={current ? "step" : undefined}
                                className="relative flex flex-1 flex-col items-center text-center"
                              >
                                {i > 0 ? (
                                  <span
                                    aria-hidden="true"
                                    className={cn(
                                      "absolute end-1/2 top-[18px] h-1 w-full -translate-y-1/2 rounded-full",
                                      i <= stepIndex ? "bg-accent" : "bg-surface-2",
                                    )}
                                  />
                                ) : null}
                                <span
                                  className={cn(
                                    "relative z-10 grid size-9 place-items-center rounded-full",
                                    current
                                      ? "bg-accent text-accent-fg ring-4 ring-accent/20"
                                      : done
                                        ? "bg-accent text-accent-fg"
                                        : "bg-surface-2 text-fg-subtle",
                                  )}
                                >
                                  <Icon className="size-[18px]" aria-hidden="true" />
                                </span>
                                <span
                                  className={cn(
                                    "mt-1.5 text-[11px] leading-tight",
                                    current ? "font-bold text-fg" : "text-fg-muted",
                                  )}
                                >
                                  {t(`guest.stepShort.${key}`)}
                                </span>
                              </li>
                            );
                          })}
                        </ol>
                      ) : null}
                      <p className="mt-4 rounded-2xl bg-surface-2 px-4 py-3 text-sm font-medium">
                        {t(`guest.statusHint.${o.status}`)}
                      </p>
                      {guest.restaurant.kind === "food_court" &&
                      o.customerPhone &&
                      !["ready", "served", "cancelled"].includes(o.status) ? (
                        <p className="mt-2 flex items-center gap-2 px-1 text-xs text-fg-muted">
                          <Smartphone className="size-3.5 shrink-0 text-accent-text" aria-hidden="true" />
                          {t("guest.smsSent", {
                            phone: `${o.customerPhone.slice(0, 4)}•••${o.customerPhone.slice(-3)}`,
                          })}
                        </p>
                      ) : null}

                      <ul className="mt-4 space-y-2.5 text-[15px]">
                        {o.items.map((i) => (
                          <li key={i.id} className="flex justify-between gap-3">
                            <span className="flex gap-2">
                              <span className="grid h-6 min-w-6 place-items-center rounded-md bg-surface-2 px-1 text-xs font-bold tabular-nums">
                                {i.quantity}
                              </span>
                              <span>
                                <span className="font-medium">{i.productName}</span>
                                {i.options.length ? (
                                  <span className="block text-sm text-fg-muted">
                                    {i.options.map((x) => x.valueName).join("، ")}
                                  </span>
                                ) : null}
                                {i.note ? (
                                  <span className="block text-xs text-fg-subtle">« {i.note} »</span>
                                ) : null}
                              </span>
                            </span>
                            <span className="shrink-0 tabular-nums">{money(i.lineTotalCents)}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-4 flex items-center justify-between border-t border-border pt-3 font-semibold">
                        <span className="flex items-center gap-2">
                          {t("guest.total")}
                          {o.paymentStatus !== "unpaid" && o.status !== "cancelled" ? (
                            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-text">
                              {t(`paymentStatus.${o.paymentStatus}`)}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={cn(
                            "tabular-nums",
                            o.status === "cancelled" && "line-through opacity-60",
                          )}
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
              // Desktop: the bill and payment stay in view beside the orders.
              <aside className="lg:sticky lg:top-24 lg:col-start-2">
                <div className="mt-4 flex items-center justify-between rounded-2xl bg-surface-2 px-5 py-4 lg:mt-0">
                  <span className="font-semibold">{t("guest.yourTotal")}</span>
                  <span className="text-lg font-semibold tabular-nums">{money(total)}</span>
                </div>
                <PaymentPanel
                  state={payState}
                  currency={guest.restaurant.currency}
                  returned={returned?.status ?? null}
                />
                <Link
                  href="/account"
                  className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 hover:bg-surface-2"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
                    <Salad className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {diner ? t("account.trackedTitle") : t("account.trackTitle")}
                    </span>
                    <span className="block text-xs text-fg-muted">
                      {diner ? t("account.trackedBody") : t("account.trackBody")}
                    </span>
                  </span>
                </Link>
                <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl border-t border-border bg-bg/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:static lg:mt-4 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
                  <Link
                    href="/table"
                    className="flex h-14 items-center justify-center gap-2 rounded-full bg-surface-2 text-base font-bold active:bg-surface-3 lg:border lg:border-border lg:bg-surface lg:hover:bg-surface-2"
                  >
                    <Plus className="size-5" strokeWidth={2.5} aria-hidden="true" />
                    {t("guest.orderMore")}
                  </Link>
                </div>
              </aside>
            ) : null}
          </main>
        </div>
      </div>
    </LiveProvider>
  );
}
