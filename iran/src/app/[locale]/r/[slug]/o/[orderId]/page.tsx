import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Check, Phone } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { AutoRefresh } from "@/components/reservations/public-ui";
import { PlaceHeader } from "@/components/reservations/place-header";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { getCurrentDiner } from "@/server/auth/diner";
import { db } from "@/server/db/client";
import { getOnlineOrder } from "@/server/modules/online/service";
import { PushButton } from "@/components/push/push-button";
import { vapidPublicKey } from "@/server/modules/push/service";

type Props = PageProps<"/[locale]/r/[slug]/o/[orderId]">;

export const metadata: Metadata = { robots: { index: false, follow: false } };

const STEPS = ["received", "accepted", "preparing", "ready", "served"] as const;

export default function OnlineOrderStatusPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <Status params={params} />
    </Suspense>
  );
}

async function Status({ params }: Pick<Props, "params">) {
  const { slug, orderId } = await params;
  const diner = await getCurrentDiner();
  if (!diner) notFound();
  const found = await getOnlineOrder(db, diner.id, slug, orderId);
  if (!found) notFound();
  const [t, locale] = await Promise.all([getTranslations("online"), getLocale()]);
  const o = found.order;
  const money = (c: number) => formatMoney(c, o.currency, locale);
  const done = o.status === "served" || o.status === "cancelled";
  const at = STEPS.indexOf(o.status as (typeof STEPS)[number]);
  return (
    <div data-brand={found.brandColor}>
      {!done ? <AutoRefresh seconds={15} /> : null}
      <PlaceHeader
        name={found.restaurantName}
        logoKey={found.logoKey}
        title={t("statusTitle", { number: o.number })}
      />
      <main className="relative mx-auto -mt-8 max-w-md space-y-4 rounded-t-3xl bg-bg px-4 pt-6 pb-12">
        {o.status === "cancelled" ? (
          <p className="rounded-2xl bg-danger-soft p-4 text-center font-semibold text-danger">
            {t("cancelled")}
          </p>
        ) : (
          <ol className="space-y-3 rounded-2xl bg-surface p-5 ring-1 ring-border">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold",
                    i <= at ? "bg-accent text-accent-fg" : "text-fg-muted ring-1 ring-border",
                  )}
                  aria-hidden="true"
                >
                  {i < at || (i === at && s === "served") ? (
                    <Check className="size-4" strokeWidth={3} />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={cn(
                    "text-sm",
                    i === at ? "font-bold" : i < at ? "text-fg-muted" : "text-fg-subtle",
                  )}
                >
                  {t(`steps.${o.channel === "delivery" ? "delivery" : "takeaway"}.${s}`)}
                </span>
              </li>
            ))}
          </ol>
        )}
        <div className="rounded-2xl bg-surface p-5 text-sm ring-1 ring-border">
          <ul className="space-y-1.5">
            {found.items.map((it, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {it.quantity} × {it.name}
                </span>
                <span className="tabular-nums">{money(it.lineTotalCents)}</span>
              </li>
            ))}
            {o.deliveryFeeCents ? (
              <li className="flex justify-between gap-3 text-fg-muted">
                <span>{t("deliveryFee")}</span>
                <span className="tabular-nums">{money(o.deliveryFeeCents)}</span>
              </li>
            ) : null}
            {o.discountCents ? (
              <li className="flex justify-between gap-3 text-success">
                <span>{t("discount")}</span>
                <span className="tabular-nums">−{money(o.discountCents)}</span>
              </li>
            ) : null}
          </ul>
          <p className="mt-3 flex justify-between border-t border-border pt-3 text-base font-bold">
            <span>{t("total")}</span>
            <span className="tabular-nums">{money(o.totalCents)}</span>
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            {o.channel === "delivery" ? t("payOnDelivery") : t("payAtPickup")}
          </p>
          {o.deliveryAddress ? <p className="mt-3 text-fg-muted">{o.deliveryAddress}</p> : null}
        </div>
        {!done && vapidPublicKey() ? <PushButton publicKey={vapidPublicKey()!} className="w-full" /> : null}
        {found.restaurantPhone ? (
          <a
            href={`tel:${found.restaurantPhone}`}
            className="flex items-center justify-center gap-2 rounded-2xl bg-surface p-4 font-semibold ring-1 ring-border"
          >
            <Phone className="size-4" aria-hidden="true" />
            {t("call")}
          </a>
        ) : null}
        <Link href={`/r/${slug}/order`} className="block text-center text-sm text-accent-text underline">
          {t("again")}
        </Link>
      </main>
    </div>
  );
}
