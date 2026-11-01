import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { PrintButton } from "@/components/ui/print-button";
import { Link } from "@/i18n/navigation";
import { COMPANY } from "@/lib/company";
import { formatMoney } from "@/lib/money";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getBillingInvoice } from "@/server/modules/billing/service";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/billing/invoices/[paymentId]">;

export default function BillingInvoicePage(props: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface-2" />}>
      <Invoice {...props} />
    </Suspense>
  );
}

async function Invoice({ params }: Props) {
  const { restaurantId, paymentId } = await params;
  const ctx = await requireRestaurant(restaurantId, "restaurant.view");
  const [t, th, format, locale, inv] = await Promise.all([
    getTranslations("billing"),
    getTranslations("landing"),
    getFormatter(),
    getLocale(),
    getBillingInvoice(db, ctx, paymentId),
  ]);
  const p = inv.pay;
  const date = (d: Date | null) =>
    d ? format.dateTime(d, { dateStyle: "long", timeZone: ctx.restaurant.timezone }) : "—";
  const money = formatMoney(p.amountCents, p.currency, locale);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link
          href={`/dashboard/${ctx.restaurant.id}/billing`}
          className="text-sm text-fg-muted hover:text-fg"
        >
          ← {t("title")}
        </Link>
        <PrintButton label={t("print")} />
      </div>
      <Card className="p-6 sm:p-10 print:border-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-2xl font-bold">{COMPANY.name}</p>
            <p className="mt-1 text-sm text-fg-muted">{th("contact.addressValue")}</p>
            <p className="text-sm text-fg-muted" dir="ltr">
              {COMPANY.phone} · {COMPANY.email}
            </p>
          </div>
          <div className="text-end">
            <p className="text-lg font-bold">{t("invoiceTitle")}</p>
            <p className="font-mono text-sm" dir="ltr">
              {p.invoiceNumber}
            </p>
            <p className="text-sm text-fg-muted">{date(p.paidAt)}</p>
          </div>
        </div>
        <div className="mt-8 rounded-xl bg-surface-2 p-4 text-sm">
          <p className="text-fg-muted">{t("billedTo")}</p>
          <p className="font-semibold">{ctx.restaurant.name}</p>
          <p>{inv.orgName}</p>
          {inv.billingEmail ? <p dir="ltr">{inv.billingEmail}</p> : null}
        </div>
        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-start text-fg-muted">
              <th className="py-2 text-start font-medium">{t("line")}</th>
              <th className="py-2 text-end font-medium">{t("amount")}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="py-3">
                <p className="font-medium">{t("lineLabel", { plan: inv.planName, months: p.months })}</p>
                <p className="text-fg-muted">
                  {date(p.periodStart)} → {date(p.periodEnd)}
                </p>
              </td>
              <td className="py-3 text-end tabular-nums">{money}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-4 font-bold">{t("total")}</td>
              <td className="pt-4 text-end text-lg font-bold tabular-nums">{money}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-8 text-xs text-fg-muted">
          {p.provider === "zarinpal"
            ? t("paidWith", { ref: p.refId ?? "—", card: p.cardPan ?? "—" })
            : t("paidManual")}
        </p>
      </Card>
    </div>
  );
}
