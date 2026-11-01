import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card } from "@/components/ui/card";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { listInvoices } from "@/server/modules/invoices/service";
import { jalaliDateTime } from "@/lib/jalali";
import { formatMoney } from "@/lib/money";

type Params = PageProps<"/[locale]/dashboard/[restaurantId]/invoices">["params"];

export default function InvoicesPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Invoices params={params} />
    </Suspense>
  );
}

async function Invoices({ params }: { params: Params }) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "invoices.view");
  const [t, locale, list] = await Promise.all([getTranslations(), getLocale(), listInvoices(db, ctx)]);
  return (
    <>
      <PageHeader title={t("invoice.list")} description={t("invoice.listSubtitle")} />
      {list.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <h2 className="text-lg font-semibold">{t("invoice.empty")}</h2>
          <p className="mx-auto mt-1 max-w-sm text-fg-muted">{t("invoice.emptyBody")}</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="border-b border-border text-xs text-fg-muted">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("invoice.number")}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("invoice.date")}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium">
                  {t("invoice.buyer")}
                </th>
                <th scope="col" className="px-4 py-3 text-end font-medium">
                  {t("invoice.total")}
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">{t("common.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-3 font-medium" dir="ltr">
                    <span className="block text-start">{i.number}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" dir="ltr">
                    <span className="block text-start">
                      {jalaliDateTime(i.issuedAt, ctx.restaurant.timezone)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {i.buyerName ?? <span className="text-fg-muted">{t("invoice.finalConsumer")}</span>}
                    {i.tableLabel ? (
                      <span className="block text-xs text-fg-muted">
                        {t("invoice.table")} {i.tableLabel}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {formatMoney(i.totalCents, i.currency, locale)}
                  </td>
                  <td className="px-4 py-3 text-end whitespace-nowrap">
                    <a
                      href={`/invoice/${i.publicToken}`}
                      target="_blank"
                      rel="noopener"
                      className="text-accent-text hover:underline"
                    >
                      {t("invoice.print")}
                    </a>
                    {" · "}
                    <a
                      href={`/api/v1/invoices/${i.publicToken}/pdf`}
                      className="text-accent-text hover:underline"
                    >
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
