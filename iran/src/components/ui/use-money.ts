import { useLocale } from "next-intl";
import { useCallback } from "react";
import { formatMoney } from "@/lib/money";

/** Client-side money formatter (tomans for IRR), in the current UI language. */
export function useMoney(currency: string) {
  const locale = useLocale();
  return useCallback((cents: number) => formatMoney(cents, currency, locale), [currency, locale]);
}
