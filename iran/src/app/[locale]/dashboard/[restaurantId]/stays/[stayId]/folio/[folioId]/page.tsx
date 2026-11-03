import { Suspense } from "react";
import { eq, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { restaurantSettings, restaurants } from "@/server/db/schema";
import { getMoney } from "@/lib/money-server";
import { getStay } from "@/server/modules/pms/stays";
import { PrintButton } from "@/components/ui/print-button";
import { FolioLineLabel } from "@/components/pms/folio-line-label";
import { notFound } from "next/navigation";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/stays/[stayId]/folio/[folioId]">;

export default function FolioPrintPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <FolioPrint params={params} />
    </Suspense>
  );
}

/** The guest's bill as a printable invoice (live lines only, VAT breakdown, payments). */
async function FolioPrint({ params }: Pick<Props, "params">) {
  const { restaurantId, stayId, folioId } = await params;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  const card = await getStay(db, ctx, stayId);
  const folio = card.folios.find((f) => f.id === folioId);
  if (!folio) notFound();
  const locale = await getLocale();
  const [t, money, [hotel]] = await Promise.all([
    getTranslations("pms.invoice"),
    getMoney(ctx.restaurant.currency),
    db
      .select({
        name: restaurants.name,
        address: sql<string>`concat_ws(chr(10), ${restaurants.addressLine1}, ${restaurants.addressLine2})`,
        phone: restaurants.phone,
        legalName: restaurantSettings.legalName,
        legalId: restaurantSettings.legalId,
        vatNumber: restaurantSettings.vatNumber,
        legalNotice: restaurantSettings.legalNotice,
      })
      .from(restaurants)
      .innerJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
      .where(eq(restaurants.id, ctx.restaurant.id)),
  ]);
  const day = (d: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));
  const live = folio.lines.filter((l) => !l.voidedAt);
  const charges = live.filter((l) => l.kind !== "payment" && l.department !== "transfer");
  const credits = live.filter((l) => l.kind === "payment" || l.department === "transfer");
  const g = card.guest;
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-black print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton label={t("print")} />
      </div>
      <header className="mb-8 flex flex-wrap justify-between gap-6 border-b border-black/20 pb-6">
        <div>
          <p className="text-xl font-bold tracking-wide">{hotel?.legalName || hotel?.name}</p>
          {hotel?.address ? <p className="text-sm whitespace-pre-line">{hotel.address}</p> : null}
          {hotel?.phone ? (
            <p className="text-sm" dir="ltr">
              {hotel.phone}
            </p>
          ) : null}
          {hotel?.legalId ? <p className="text-xs">{t("legalId", { id: hotel.legalId })}</p> : null}
          {hotel?.vatNumber ? <p className="text-xs">{t("vat", { id: hotel.vatNumber })}</p> : null}
        </div>
        <div className="text-end">
          <p className="text-2xl font-light tracking-[0.2em] uppercase">{t("title")}</p>
          <p className="text-sm">{t("number", { number: folio.number })}</p>
          <p className="text-sm">{t("stay", { number: card.number })}</p>
        </div>
      </header>
      <section className="mb-6 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="text-xs font-semibold tracking-wide uppercase opacity-60">{t("billTo")}</p>
          <p className="font-semibold">
            {folio.accountName ?? [g.lastName, g.firstName].filter(Boolean).join(" ")}
          </p>
          {g.address ? <p className="whitespace-pre-line">{g.address}</p> : null}
        </div>
        <div className="text-end">
          <p>{t("room", { room: card.roomLabel ?? "—" })}</p>
          <p>
            {day(card.arrival)} → {day(card.departure)}
          </p>
        </div>
      </section>
      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b border-black/30 text-start text-xs uppercase">
            <th className="py-2 text-start">{t("date")}</th>
            <th className="py-2 text-start">{t("description")}</th>
            <th className="py-2 text-end">{t("amount")}</th>
          </tr>
        </thead>
        <tbody>
          {charges.map((l) => (
            <tr key={l.id} className="border-b border-black/10">
              <td className="py-1.5 pe-3 whitespace-nowrap">{day(l.businessDate)}</td>
              <td className="py-1.5">
                <FolioLineLabel description={l.description} department={l.department} method={l.method} />
                {l.quantity > 1 ? ` × ${l.quantity}` : ""}
              </td>
              <td className="py-1.5 text-end tabular-nums">{money(l.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ms-auto w-full max-w-xs space-y-1 text-sm">
        <p className="flex justify-between font-semibold">
          <span>{t("totalCharges")}</span>
          <span className="tabular-nums">{money(charges.reduce((s, l) => s + l.amountCents, 0))}</span>
        </p>
        {folio.taxes.map((x) => (
          <p key={x.rateBps} className="flex justify-between text-xs">
            <span>{t("taxLine", { rate: x.rateBps / 100, base: money(x.baseCents) })}</span>
            <span className="tabular-nums">{money(x.taxCents)}</span>
          </p>
        ))}
        {credits.map((l) => (
          <p key={l.id} className="flex justify-between">
            <span>
              <FolioLineLabel description={l.description} department={l.department} method={l.method} /> ·{" "}
              {day(l.businessDate)}
            </span>
            <span className="tabular-nums">{money(l.amountCents)}</span>
          </p>
        ))}
        <p className="flex justify-between border-t border-black/40 pt-2 text-lg font-bold">
          <span>{t("balance")}</span>
          <span className="tabular-nums">{money(folio.balanceCents)}</span>
        </p>
      </div>
      {hotel?.legalNotice ? (
        <p className="mt-10 text-xs whitespace-pre-line opacity-70">{hotel.legalNotice}</p>
      ) : null}
    </div>
  );
}
