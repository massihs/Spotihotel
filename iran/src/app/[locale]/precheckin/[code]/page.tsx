import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/server/db/client";
import { precheckinView } from "@/server/modules/pms/precheckin";
import { PrecheckinForm } from "@/components/guest/precheckin-form";
import { calendarLocale } from "@/lib/jalali-calendar";
import { EDITION } from "@/config/edition";
import { nightsBetween } from "@/server/modules/pms/calc";

type Props = PageProps<"/[locale]/precheckin/[code]">;

export default function PrecheckinPage({ params }: Props) {
  return (
    <Suspense
      fallback={<div className="mx-auto mt-10 h-96 max-w-xl animate-pulse rounded-3xl bg-surface-2" />}
    >
      <Precheckin params={params} />
    </Suspense>
  );
}

/** Online pre-check-in (private link of the booking): the registration card before arrival. */
async function Precheckin({ params }: Pick<Props, "params">) {
  await connection();
  const { code } = await params;
  const view = await precheckinView(db, code);
  if (!view) notFound();
  const [t, locale] = await Promise.all([getTranslations("precheckin"), getLocale()]);
  const day = (d: string) =>
    new Intl.DateTimeFormat(calendarLocale(locale, EDITION), {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));
  return (
    <div data-brand={view.hotel.brandColor} className="min-h-dvh bg-bg px-4 py-6">
      <div className="mx-auto max-w-xl space-y-5">
        <header className="rounded-3xl bg-[var(--sidebar)] p-6 text-[var(--sidebar-fg)]">
          <p className="text-xs tracking-[0.2em] text-[var(--brass)] uppercase">{view.hotel.name}</p>
          <h1 className="mt-1 text-2xl font-bold">{t("title")}</h1>
          <p className="mt-2 text-sm opacity-80">
            {t("stay", {
              number: view.number,
              type: view.roomType,
              nights: nightsBetween(view.arrival, view.departure),
            })}
          </p>
          <p className="text-sm opacity-80">
            {day(view.arrival)} → {day(view.departure)}
          </p>
        </header>
        {view.open ? (
          <section className="rounded-3xl border border-border bg-surface p-5">
            <p className="mb-4 text-sm text-fg-muted">{t("intro")}</p>
            <PrecheckinForm code={code} guest={view.guest} eta={view.eta} done={view.done} />
          </section>
        ) : (
          <p className="rounded-3xl bg-surface-2 p-6 text-center text-sm text-fg-muted">{t("closed")}</p>
        )}
      </div>
    </div>
  );
}
