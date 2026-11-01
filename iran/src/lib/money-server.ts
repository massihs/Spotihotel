import "server-only";
import { getLocale } from "next-intl/server";
import { formatMoney } from "./money";

/** Server-side money formatter (tomans for IRR), in the request's UI language. */
export async function getMoney(currency: string) {
  const locale = await getLocale();
  return (cents: number) => formatMoney(cents, currency, locale);
}
