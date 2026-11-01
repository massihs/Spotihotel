import { edition } from "@/config/edition";

/** Every locale the code base has messages for. */
export const ALL_LOCALES = ["fr", "en", "fa", "ar"] as const;
export type AppLocale = (typeof ALL_LOCALES)[number];
/** Locales offered by this deployment (depends on the edition, see src/config/edition.ts). */
export const LOCALES = edition.locales as readonly [AppLocale, ...AppLocale[]];
export const DEFAULT_LOCALE: AppLocale = edition.defaultLocale;

export const RTL_LOCALES: ReadonlySet<AppLocale> = new Set(["fa", "ar"]);
export const localeDirection = (l: AppLocale) => (RTL_LOCALES.has(l) ? "rtl" : "ltr");

export const LOCALE_LABELS: Record<AppLocale, string> = {
  fr: "Français",
  en: "English",
  fa: "فارسی",
  ar: "العربية",
};

export const isLocale = (v: unknown): v is AppLocale =>
  typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** Intl locale used for numbers/dates (Persian → Latin digits kept off by default for prices). */
export const INTL_LOCALE: Record<AppLocale, string> = {
  fr: "fr-FR",
  en: "en-GB",
  fa: "fa-IR",
  ar: "ar",
};
