import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { getDirectory } from "@/server/modules/directory/cache";
import { icsEvent } from "@/server/modules/reservations/ics";
import { getByCode } from "@/server/modules/reservations/service";

/**
 * GET /api/v1/bookings/{slug}/{code}/calendar — the booking as an .ics file for the guest's agenda.
 * The unguessable code is the access, like the booking's status page.
 */
export async function GET(
  _req: Request,
  { params }: RouteContext<"/api/v1/bookings/[slug]/[code]/calendar">,
) {
  await connection();
  const { slug, code } = await params;
  const found = await getByCode(db, slug, code);
  if (!found || found.reservation.kind !== "booking") return new Response("Not found", { status: 404 });
  const { place, reservation: r } = found;
  const locale = isLocale(place.defaultLocale) ? place.defaultLocale : DEFAULT_LOCALE;
  const [t, listing] = await Promise.all([
    getTranslations({ locale, namespace: "booking" }),
    getDirectory().then((all) => all.find((e) => e.id === place.id)),
  ]);
  const body = icsEvent({
    uid: `${r.code}@spotifood`,
    start: r.startsAt,
    minutes: r.durationMin,
    title: t("icsTitle", { restaurant: place.name, count: r.partySize }),
    location: listing?.address ?? null,
    url: `${env().APP_URL}/r/${place.slug}/b/${r.code}`,
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="booking-${place.slug}.ics"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
