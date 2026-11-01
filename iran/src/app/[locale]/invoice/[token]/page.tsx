import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/server/db/client";
import { getInvoiceByToken } from "@/server/modules/invoices/service";
import { jalaliDateTime } from "@/lib/jalali";
import { formatMoney } from "@/lib/money";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Public invoice (unguessable link): what the guest keeps, prints or saves as PDF. */
export default function InvoicePage(props: PageProps<"/[locale]/invoice/[token]">) {
  return (
    <Suspense
      fallback={<div className="mx-auto mt-16 h-96 max-w-3xl animate-pulse rounded-2xl bg-surface-2" />}
    >
      <Invoice {...props} />
    </Suspense>
  );
}

async function Invoice({ params }: PageProps<"/[locale]/invoice/[token]">) {
  const { token } = await params;
  const row = await getInvoiceByToken(db, token);
  if (!row) notFound();
  const [t, locale] = await Promise.all([getTranslations("invoice"), getLocale()]);
  const { invoice, timezone } = row;
  const s = invoice.snapshot;
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const rial = (c: number) => `${nf.format(Math.round(c / 100))} ${t("rial")}`;
  const money = (c: number) => (s.currency === "IRR" ? rial(c) : formatMoney(c, s.currency, locale));
  const pct = (bps: number) => `${nf.format(bps / 100)}٪`;
  const party = (p: NonNullable<typeof s.buyer>) =>
    [
      p.nationalId && `${t("nationalId")}: ${p.nationalId}`,
      p.economicCode && `${t("economicCode")}: ${p.economicCode}`,
      p.registrationNumber && `${t("registrationNumber")}: ${p.registrationNumber}`,
      [p.city, p.address].filter(Boolean).join("، ") || null,
      p.postalCode && `${t("postalCode")}: ${p.postalCode}`,
      p.phone && `${t("phone")}: ${p.phone}`,
    ].filter(Boolean) as string[];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap justify-end gap-2 print:hidden">
        <a
          href={`/api/v1/invoices/${invoice.publicToken}/pdf`}
          className="inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg"
        >
          {t("downloadPdf")}
        </a>
        <PrintButton label={t("print")} />
      </div>
      <article className="rounded-2xl border border-border bg-surface p-6 print:border-0 print:p-0">
        <header className="text-center">
          <h1 className="text-xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-fg-muted">{s.seller.tradeName}</p>
        </header>
        <dl className="mt-6 grid gap-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="inline text-fg-muted">{t("number")}: </dt>
            <dd className="inline font-semibold" dir="ltr">
              {invoice.number}
            </dd>
          </div>
          <div>
            <dt className="inline text-fg-muted">{t("date")}: </dt>
            <dd className="inline" dir="ltr">
              {jalaliDateTime(invoice.issuedAt, timezone)}
            </dd>
          </div>
          {s.tableLabel ? (
            <div>
              <dt className="inline text-fg-muted">{t("table")}: </dt>
              <dd className="inline">{s.tableLabel}</dd>
            </div>
          ) : null}
          {s.orders.length ? (
            <div>
              <dt className="inline text-fg-muted">{t("orders")}: </dt>
              <dd className="inline" dir="ltr">
                {s.orders.map((o) => o.number).join(" · ")}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <section className="rounded-xl border border-border p-4 text-sm">
            <h2 className="font-semibold">{t("seller")}</h2>
            <p className="mt-1">{s.seller.name}</p>
            {party(s.seller).map((l) => (
              <p key={l} className="text-fg-muted">
                {l}
              </p>
            ))}
          </section>
          <section className="rounded-xl border border-border p-4 text-sm">
            <h2 className="font-semibold">{t("buyer")}</h2>
            {s.buyer ? (
              <>
                <p className="mt-1">{s.buyer.name}</p>
                {party(s.buyer).map((l) => (
                  <p key={l} className="text-fg-muted">
                    {l}
                  </p>
                ))}
              </>
            ) : (
              <p className="mt-1 text-fg-muted">{t("finalConsumer")}</p>
            )}
          </section>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-fg-muted">
              <tr>
                <th className="hidden px-3 py-2 text-start font-medium sm:table-cell">{t("row")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("description")}</th>
                <th className="px-3 py-2 text-center font-medium">{t("quantity")}</th>
                <th className="hidden px-3 py-2 text-end font-medium sm:table-cell">{t("unitPrice")}</th>
                <th className="px-3 py-2 text-end font-medium">{t("lineTotal")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {s.lines.map((l, i) => (
                <tr key={i}>
                  <td className="hidden px-3 py-2 sm:table-cell">{nf.format(i + 1)}</td>
                  <td className="px-3 py-2">
                    {l.name}
                    {l.options.length ? (
                      <span className="text-fg-muted"> ({l.options.join("، ")})</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-center">{nf.format(l.quantity)}</td>
                  <td className="hidden px-3 py-2 text-end whitespace-nowrap tabular-nums sm:table-cell">
                    {money(l.unitPriceCents)}
                  </td>
                  <td className="px-3 py-2 text-end whitespace-nowrap tabular-nums">
                    {money(l.lineTotalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ms-auto mt-6 max-w-sm space-y-1 text-sm">
          {s.discountCents > 0 ? (
            <div className="flex justify-between gap-4 text-fg-muted">
              <dt>{t("discount")}</dt>
              <dd className="tabular-nums">−{money(s.discountCents)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt>{t("beforeTax")}</dt>
            <dd className="tabular-nums">
              {money(s.taxes.reduce((sum, x) => sum + x.baseCents, 0) || s.subtotalCents)}
            </dd>
          </div>
          {s.taxes
            .filter((x) => x.rateBps > 0)
            .map((x) => (
              <div key={x.rateBps} className="flex justify-between gap-4">
                <dt>{t("vat", { rate: pct(x.rateBps) })}</dt>
                <dd className="tabular-nums">{money(x.taxCents)}</dd>
              </div>
            ))}
          <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-bold">
            <dt>{t("total")}</dt>
            <dd className="tabular-nums">{money(s.totalCents)}</dd>
          </div>
          {s.currency === "IRR" ? (
            <p className="text-end text-xs text-fg-muted">{formatMoney(s.totalCents, s.currency, locale)}</p>
          ) : null}
        </dl>

        <section className="mt-6 text-sm text-fg-muted">
          {s.payments.map((p, i) => (
            <p key={i}>
              {t("paidWith", {
                method: t.has(`provider.${p.provider}`) ? t(`provider.${p.provider}`) : p.provider,
              })}{" "}
              · {money(p.amountCents)} · <span dir="ltr">{jalaliDateTime(new Date(p.at), timezone)}</span>
              {p.reference ? (
                <>
                  {" "}
                  · {t("reference")}: <span dir="ltr">{p.reference}</span>
                </>
              ) : null}
            </p>
          ))}
          {s.notes ? <p className="mt-3 whitespace-pre-line">{s.notes}</p> : null}
        </section>
      </article>
    </main>
  );
}
