/**
 * Spotifood ships as two editions built from the same code base:
 *
 * - `global` — international SaaS (EU/World): French by default, EUR, Stripe.
 * - `iran`   — Iranian market, hosted in Iran (Liara): Persian by default, IRR, Zarinpal,
 *              no dependency on services that are unreachable from Iran.
 *
 * The edition is fixed at build time (`NEXT_PUBLIC_EDITION`, inlined in client and server
 * bundles) because it changes the URL structure (locales) and the default language.
 * Each edition is a separate deployment with its own database: data never crosses.
 */
export const EDITIONS = ["global", "iran"] as const;
export type Edition = (typeof EDITIONS)[number];

type Locale = "fr" | "en" | "fa" | "ar";

export type EditionConfig = {
  edition: Edition;
  /** Locales offered by this deployment, in the order shown in language pickers. */
  locales: readonly Locale[];
  defaultLocale: Locale;
  /** Defaults for a newly created restaurant (editable in its settings). */
  restaurantDefaults: { currency: string; timezone: string; country: string };
  /** Currencies suggested in the restaurant settings. */
  currencies: readonly string[];
  /** Currency of the platform's own subscription plans. */
  platformCurrency: string;
  /** Monthly plan prices (minor units of platformCurrency). Iran prices are placeholders to set. */
  planPrices: Record<"free" | "starter" | "professional" | "enterprise", number>;
  /** Music offer, per month, platform currency minor units. */
  musicPrices: Record<"weekly" | "monthly", number>;
  /** Demo data only: converts the seed's euro prices into this edition's currency. */
  demoPrice: (eurCents: number) => number;
  /** Online payment providers this edition can offer (each still needs its credentials). */
  onlineProviders: readonly ("stripe" | "zarinpal")[];
  /** Languages enabled on a new restaurant's guest menu. */
  restaurantLocales: readonly Locale[];
  /** VAT rates created with a new restaurant (basis points). */
  defaultTaxRates: readonly { name: string; rateBps: number; isDefault: boolean }[];
};

const CONFIGS: Record<Edition, EditionConfig> = {
  global: {
    edition: "global",
    locales: ["fr", "en", "fa", "ar"],
    defaultLocale: "fr",
    restaurantDefaults: { currency: "EUR", timezone: "Europe/Paris", country: "FR" },
    currencies: [
      "EUR",
      "USD",
      "GBP",
      "CHF",
      "CAD",
      "MAD",
      "TND",
      "DZD",
      "AED",
      "SAR",
      "QAR",
      "KWD",
      "TRY",
      "XOF",
    ],
    platformCurrency: "EUR",
    planPrices: { free: 0, starter: 2900, professional: 7900, enterprise: 0 },
    musicPrices: { weekly: 2900, monthly: 1900 },
    demoPrice: (eurCents) => eurCents,
    onlineProviders: ["stripe"],
    restaurantLocales: ["fr", "en"],
    defaultTaxRates: [
      { name: "TVA 10 % (sur place)", rateBps: 1000, isDefault: true },
      { name: "TVA 20 % (alcool)", rateBps: 2000, isDefault: false },
      { name: "TVA 5,5 %", rateBps: 550, isDefault: false },
    ],
  },
  iran: {
    edition: "iran",
    locales: ["fa", "en", "ar"],
    defaultLocale: "fa",
    restaurantDefaults: { currency: "IRR", timezone: "Asia/Tehran", country: "IR" },
    currencies: ["IRR"],
    platformCurrency: "IRR",
    // 990,000 and 2,490,000 toman per month — placeholders, to be set by the business.
    planPrices: { free: 0, starter: 990_000_000, professional: 2_490_000_000, enterprise: 0 },
    // 590,000 and 390,000 toman per month — placeholders, to be set by the business.
    musicPrices: { weekly: 590_000_000, monthly: 390_000_000 },
    // ≈ 400,000 rials per euro, rounded to 10,000 rials (1,000 toman).
    demoPrice: (eurCents) => Math.round((eurCents * 400_000) / 1_000_000) * 1_000_000,
    onlineProviders: ["zarinpal"],
    restaurantLocales: ["fa", "en"],
    defaultTaxRates: [
      { name: "مالیات بر ارزش افزوده ۱۰٪", rateBps: 1000, isDefault: true },
      { name: "بدون مالیات", rateBps: 0, isDefault: false },
    ],
  },
};

export function parseEdition(value: string | undefined): Edition {
  // This folder is the Iran application: it builds the Iran edition unless told otherwise.
  if (value === undefined || value === "") return "iran";
  if ((EDITIONS as readonly string[]).includes(value)) return value as Edition;
  throw new Error(`Unknown NEXT_PUBLIC_EDITION "${value}" (expected: ${EDITIONS.join(", ")})`);
}

export const EDITION: Edition = parseEdition(process.env.NEXT_PUBLIC_EDITION);
export const edition: EditionConfig = CONFIGS[EDITION];
export const editionConfig = (e: Edition): EditionConfig => CONFIGS[e];
