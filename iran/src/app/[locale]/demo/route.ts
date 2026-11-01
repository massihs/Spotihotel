import { NextResponse } from "next/server";
import { connection } from "next/server";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { getPathname } from "@/i18n/navigation";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { pickDemoTable } from "@/server/modules/guest/demo";

/**
 * GET /demo — try Spotifood as a guest: seats the visitor at a table of the demo restaurant
 * (same path as scanning its QR code). Without a demo restaurant, the restaurant guide.
 */
export async function GET(_req: Request, { params }: RouteContext<"/[locale]/demo">) {
  await connection();
  const { locale } = await params;
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const token = await pickDemoTable(db).catch(() => null);
  const path = token ? `/t/${token}` : "/restaurants";
  return NextResponse.redirect(new URL(getPathname({ href: path, locale: l }), env().APP_URL), 303);
}
