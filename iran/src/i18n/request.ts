import { getRequestConfig } from "next-intl/server";
import { locale as rootLocale } from "next/root-params";
import { edition } from "@/config/edition";
import { DEFAULT_LOCALE, isLocale } from "./config";

export default getRequestConfig(async ({ locale }) => {
  let candidate: string | undefined = locale;
  if (!candidate) {
    try {
      candidate = await rootLocale();
    } catch {
      // Not available in server actions / route handlers.
      candidate = undefined;
    }
  }
  const resolved = isLocale(candidate) ? candidate : DEFAULT_LOCALE;
  return {
    locale: resolved,
    // Never format with the server's zone (UTC in production). Restaurant pages pass their own zone.
    timeZone: process.env.DEFAULT_TIME_ZONE ?? edition.restaurantDefaults.timezone,
    messages: (await import(`../../messages/${resolved}.json`)).default,
  };
});
