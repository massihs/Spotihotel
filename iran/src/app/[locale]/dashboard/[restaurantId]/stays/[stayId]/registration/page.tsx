import { Suspense } from "react";
import { eq, sql } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { restaurantSettings, restaurants } from "@/server/db/schema";
import { getStay } from "@/server/modules/pms/stays";
import { nightsBetween } from "@/server/modules/pms/calc";
import { PrintButton } from "@/components/ui/print-button";
import { calendarLocale, formatCalendarDate } from "@/lib/jalali-calendar";
import { EDITION } from "@/config/edition";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/stays/[stayId]/registration">;

export default function RegistrationCardPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <RegistrationCard params={params} />
    </Suspense>
  );
}

/**
 * The registration card (برگه پذیرش) printed at check-in: the hotel, the guest's identity as the
 * police register needs it, the stay, the house rules and the guest's signature.
 */
async function RegistrationCard({ params }: Pick<Props, "params">) {
  const { restaurantId, stayId } = await params;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  const card = await getStay(db, ctx, stayId);
  const locale = await getLocale();
  const [t, [hotel]] = await Promise.all([
    getTranslations("pms.registration"),
    db
      .select({
        name: restaurants.name,
        address: sql<string>`concat_ws(' ', ${restaurants.addressLine1}, ${restaurants.city})`,
        phone: restaurants.phone,
        legalName: restaurantSettings.legalName,
      })
      .from(restaurants)
      .innerJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
      .where(eq(restaurants.id, ctx.restaurant.id)),
  ]);
  const day = (d: string) =>
    formatCalendarDate(
      new Intl.DateTimeFormat(calendarLocale(locale, EDITION), {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
      new Date(`${d}T12:00:00Z`),
    );
  const g = card.guest;
  const s = card.stay;
  const iranian = !g.nationality || g.nationality === "IR";
  const rows: [string, string | null][] = [
    [t("lastName"), g.lastName],
    [t("firstName"), g.firstName],
    [t("fatherName"), g.fatherName],
    [iranian ? t("nationalCode") : t("passport"), g.documentNumber],
    [t("nationality"), iranian ? t("iranian") : g.nationality],
    [t("birthDate"), g.birthDate ? day(g.birthDate) : null],
    [t("phone"), g.phone],
    [t("address"), g.address],
  ];
  const stayRows: [string, string | null][] = [
    [t("number"), `#${s.number}`],
    [t("room"), card.roomLabel ? `${card.roomLabel} (${card.typeCode})` : card.typeCode],
    [t("arrival"), day(s.arrival)],
    [t("departure"), day(s.departure)],
    [t("nights"), String(nightsBetween(s.arrival, s.departure))],
    [t("guests"), t("guestsValue", { adults: s.adults, children: s.children })],
    [t("company"), card.accountName],
  ];
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-black print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton label={t("print")} />
      </div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b-2 border-black pb-4">
        <div>
          <p className="text-xl font-bold">{hotel?.legalName || hotel?.name}</p>
          {hotel?.address ? <p className="text-sm">{hotel.address}</p> : null}
          {hotel?.phone ? (
            <p className="text-sm" dir="ltr">
              {hotel.phone}
            </p>
          ) : null}
        </div>
        <p className="text-2xl font-bold">{t("title")}</p>
      </header>
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-bold tracking-wide uppercase opacity-70">{t("guest")}</h2>
        <dl className="grid grid-cols-2 border border-black/30 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2 border-b border-black/15 px-3 py-2 odd:border-e">
              <dt className="w-32 shrink-0 opacity-70">{k}</dt>
              <dd className="font-semibold">{v || "—"}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-bold tracking-wide uppercase opacity-70">{t("stay")}</h2>
        <dl className="grid grid-cols-2 border border-black/30 text-sm">
          {stayRows.map(([k, v]) => (
            <div key={k} className="flex gap-2 border-b border-black/15 px-3 py-2 odd:border-e">
              <dt className="w-32 shrink-0 opacity-70">{k}</dt>
              <dd className="font-semibold">{v || "—"}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="mb-10 text-xs leading-6">
        <h2 className="mb-1 text-sm font-bold">{t("rulesTitle")}</h2>
        <p>{t("rules")}</p>
      </section>
      <footer className="grid grid-cols-2 gap-10 text-sm">
        <div>
          <p className="mb-14 opacity-70">{t("guestSignature")}</p>
          {s.precheckinSignature ? (
            <p className="mb-2 font-semibold italic">{s.precheckinSignature}</p>
          ) : null}
          <div className="border-t border-black" />
        </div>
        <div>
          <p className="mb-14 opacity-70">{t("deskSignature")}</p>
          <div className="border-t border-black" />
        </div>
      </footer>
    </div>
  );
}
