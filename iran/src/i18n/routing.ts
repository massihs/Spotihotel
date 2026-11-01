import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, LOCALES } from "./config";

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // The default language has no prefix (/login), others do (/en/login).
  localePrefix: "as-needed",
  // Always land on the edition's language (Persian for spotifood.ir), whatever the browser sends;
  // other languages stay one tap away in the language switcher.
  localeDetection: false,
});
