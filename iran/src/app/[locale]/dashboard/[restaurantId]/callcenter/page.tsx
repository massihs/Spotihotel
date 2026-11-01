import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Bike, Phone, ShoppingBag } from "lucide-react";
import { PageHeader } from "@/components/dashboard/app-shell";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { callCenterBranches, callCenterLookup } from "@/server/modules/callcenter/service";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/callcenter">;

export default function CallCenterPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-60 animate-pulse rounded-2xl bg-surface-2" />}>
      <CallCenter {...props} />
    </Suspense>
  );
}

async function CallCenter({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(restaurantId, "orders.create");
  const q = typeof sp.phone === "string" ? sp.phone.slice(0, 20) : "";
  const [t, ts, format, locale, branches] = await Promise.all([
    getTranslations("callcenter"),
    getTranslations("orderStatus"),
    getFormatter(),
    getLocale(),
    callCenterBranches(db, ctx),
  ]);
  let result: Awaited<ReturnType<typeof callCenterLookup>> | null = null;
  let invalid = false;
  if (q) {
    try {
      result = await callCenterLookup(db, ctx, q);
    } catch (e) {
      if (isAppError(e)) invalid = true;
      else throw e;
    }
  }
  const pos = (branchId: string, channel: string) =>
    `/dashboard/${branchId}/pos?phone=${encodeURIComponent(result?.phone ?? q)}&channel=${channel}`;
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle", { count: branches.length })} />
      <form role="search" className="mb-6 flex max-w-xl gap-2">
        <Input
          name="phone"
          defaultValue={q}
          inputMode="tel"
          dir="ltr"
          autoFocus
          placeholder={t("phonePlaceholder")}
          aria-label={t("phonePlaceholder")}
          className="h-12 text-lg"
        />
        <button type="submit" className={buttonClasses("primary", "lg")}>
          <Phone className="size-4" aria-hidden="true" />
          {t("search")}
        </button>
      </form>
      {invalid ? <p className="text-sm text-danger">{t("invalid")}</p> : null}
      {result ? (
        <ul className="grid gap-4 lg:grid-cols-2">
          {result.branches.map((b) => (
            <li key={b.id}>
              <Card className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold">{b.name}</p>
                    {b.customer ? (
                      <p className="text-sm text-fg-muted">
                        {b.customer.name ? `${b.customer.name} · ` : ""}
                        {t("orders", { count: b.customer.ordersCount })}
                        {b.customer.points ? ` · ${t("points", { count: b.customer.points })}` : ""}
                      </p>
                    ) : (
                      <p className="text-sm text-fg-subtle">{t("unknown")}</p>
                    )}
                  </div>
                </div>
                {b.customer?.addresses.length ? (
                  <ul className="mt-3 space-y-1 text-sm">
                    {b.customer.addresses.map((a) => (
                      <li key={a.id} className="rounded-lg bg-surface-2 px-3 py-1.5">
                        {a.address}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {b.orders.length ? (
                  <ul className="mt-3 divide-y divide-border text-sm">
                    {b.orders.map((o) => (
                      <li key={o.id} className="flex justify-between gap-2 py-1.5">
                        <span>
                          #{o.number} · {ts(o.status)} ·{" "}
                          {format.dateTime(o.placedAt, {
                            dateStyle: "short",
                            timeZone: ctx.restaurant.timezone,
                          })}
                        </span>
                        <span className="tabular-nums">{formatMoney(o.totalCents, o.currency, locale)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Link href={pos(b.id, "delivery")} className={buttonClasses("primary", "md")}>
                    <Bike className="size-4" aria-hidden="true" />
                    {t("newDelivery")}
                  </Link>
                  <Link href={pos(b.id, "takeaway")} className={buttonClasses("secondary", "md")}>
                    <ShoppingBag className="size-4" aria-hidden="true" />
                    {t("newTakeaway")}
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : !invalid ? (
        <Card className="max-w-xl p-6 text-sm text-fg-muted">{t("empty")}</Card>
      ) : null}
    </>
  );
}
