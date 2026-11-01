import { RESTAURANT_KINDS } from "@/lib/restaurant-kind";
import { MENU_THEMES } from "@/lib/menu-themes";
import { BRAND_COLORS } from "@/lib/brand-colors";
import { z } from "zod";
import { LOCALES } from "@/i18n/config";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const SUPPORTED_CURRENCIES = new Set(Intl.supportedValuesOf("currency"));
const SUPPORTED_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(160),
  kind: z.enum(RESTAURANT_KINDS).optional(),
  brandColor: z.enum(BRAND_COLORS.map((b) => b.key) as [string, ...string[]]).optional(),
  menuTheme: z.enum(MENU_THEMES).optional(),
  menuShortPrices: z.boolean().optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(320)
    .transform((v) => (v === "" ? null : v))
    .pipe(z.email().nullable())
    .optional(),
  phone: optionalText(32).refine((v) => !v || /^[+0-9 ().-]{6,32}$/.test(v), "invalid_phone"),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(100),
  postalCode: optionalText(20),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "invalid_country"),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => SUPPORTED_CURRENCIES.has(v), "invalid_currency"),
  timezone: z.string().refine((v) => SUPPORTED_TIMEZONES.has(v), "invalid_timezone"),
  defaultLocale: z.enum(LOCALES),
});
export type ProfileInput = z.infer<typeof profileSchema>;

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const DAY_KEYS = DAYS;
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "invalid_time");

export const openingHoursSchema = z.partialRecord(
  z.enum(DAYS),
  z.array(z.object({ open: hhmm, close: hhmm })).max(3),
);

export const serviceSettingsSchema = z.object({
  orderPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,4}$/, "invalid_prefix"),
  pricesIncludeTax: z.boolean(),
  sessionAutoCloseMinutes: z.number().int().min(15).max(1440).nullable(),
  enabledLocales: z.array(z.enum(LOCALES)).min(1),
  openingHours: openingHoursSchema.nullable(),
});
export type ServiceSettingsInput = z.infer<typeof serviceSettingsSchema>;

export const legalSchema = z.object({
  legalName: optionalText(200),
  legalId: optionalText(64),
  vatNumber: optionalText(64),
  registrationNumber: optionalText(64),
  legalNotice: optionalText(4000),
  privacyPolicyUrl: optionalText(500).refine((v) => !v || /^https:\/\/\S+$/.test(v), "invalid_url"),
});
export type LegalInput = z.infer<typeof legalSchema>;

export const taxRateSchema = z.object({
  name: z.string().trim().min(1).max(64),
  /** Percent as entered by the user ("10", "5,5") → basis points. */
  rateBps: z.number().int().min(0).max(10_000),
});
export type TaxRateInput = z.infer<typeof taxRateSchema>;

/** "5,5" → 550 bps; null when invalid. */
export function parsePercentToBps(input: string): number | null {
  const v = input.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(v)) return null;
  const [w, f = ""] = v.split(".");
  const bps = Number(w) * 100 + Number(f.padEnd(2, "0"));
  return bps <= 10_000 ? bps : null;
}
