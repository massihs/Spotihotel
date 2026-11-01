import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { restaurantSettings } from "@/server/db/schema";
import { isAppError } from "@/server/errors";
import { enforceRateLimit } from "@/server/infra/rate-limit";
import {
  GUEST_COOKIE,
  guestCookieOptions,
  newGuestId,
  readSigned,
  SEAT_COOKIE,
  seatCookieOptions,
  signValue,
} from "@/server/modules/guest/cookies";
import { enterTableByQr } from "@/server/modules/guest/sessions";
import { getPathname } from "@/i18n/navigation";
import { DEFAULT_LOCALE, isLocale, type AppLocale } from "@/i18n/config";
import { env } from "@/server/env";

/**
 * Entry point of every printed QR code: GET /t/{qrToken}
 *  1. resolves the table (unknown/disabled/suspended → friendly error page)
 *  2. identifies the device (signed cookie), opens or joins the table session
 *  3. seats the device as "Client N" and redirects to the guest app (/table)
 * The QR token never stays in the app URL, so a screenshot of the menu does not leak it.
 */
export async function GET(req: NextRequest, { params }: RouteContext<"/[locale]/t/[token]">) {
  const { locale, token } = await params;
  const requested: AppLocale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  // Absolute URL from APP_URL, never from req.url: behind a proxy or with `-H 0.0.0.0`, the
  // request URL carries the internal host and the browser would lose its cookies.
  const to = (path: string, l: AppLocale) => new URL(getPathname({ href: path, locale: l }), env().APP_URL);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    await enforceRateLimit("qrEntry", ip);
  } catch (e) {
    if (isAppError(e) && e.code === "RATE_LIMITED")
      return new NextResponse("Too many requests", { status: 429 });
    throw e;
  }

  const guestId = readSigned(req.cookies.get(GUEST_COOKIE)?.value) ?? newGuestId();
  const entry = await enterTableByQr(db, token, guestId);
  if (!entry) return NextResponse.redirect(to("/t/invalid", requested), 303);

  // Respect the languages the restaurant offers.
  const [settings] = await db
    .select({ enabledLocales: restaurantSettings.enabledLocales })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, entry.restaurant.id));
  const allowed = settings?.enabledLocales ?? [entry.restaurant.defaultLocale];
  const fallback: AppLocale = isLocale(entry.restaurant.defaultLocale)
    ? entry.restaurant.defaultLocale
    : DEFAULT_LOCALE;
  const target: AppLocale = allowed.includes(requested) ? requested : fallback;

  // `welcome`: the menu opens behind the restaurant's animated logo (components/guest/welcome-splash).
  const dest = to("/table", target);
  dest.searchParams.set("welcome", "1");
  const res = NextResponse.redirect(dest, 303);
  res.cookies.set(GUEST_COOKIE, signValue(guestId), guestCookieOptions);
  res.cookies.set(SEAT_COOKIE, signValue(entry.participant.id), seatCookieOptions);
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
