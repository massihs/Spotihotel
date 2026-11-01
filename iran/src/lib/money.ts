/**
 * Money is always an integer number of minor units (cents). Never use floats for amounts.
 * Tax rates are basis points (1000 = 10%).
 */

export type Cents = number;

export function assertCents(value: number, label = "amount"): asserts value is Cents {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be an integer number of cents`);
}

/**
 * Largest amount accepted anywhere (cents): 100 billion currency units. Large enough for Rial
 * amounts, small enough that quantity × price sums stay exact JS integers.
 */
export const MAX_AMOUNT_CENTS = 10_000_000_000_000;

/** Persian (۰-۹) and Arabic-Indic (٠-٩) digits → ASCII, so Iranian keyboards work everywhere. */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** Parses user input such as "19,90", "19.9", "19", "۱۲۰۰۰۰" into cents. Returns null when invalid. */
export function parseMoney(input: string): Cents | null {
  const normalized = normalizeDigits(input)
    .trim()
    .replace(/[\s٬]/g, "") // spaces and the Arabic thousands separator
    .replace(/[,٫]/, ".");
  if (!/^\d{1,11}(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, frac = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** Banker-safe integer division with half-up rounding, for positive and negative values. */
export function divRound(numerator: number, denominator: number): number {
  if (denominator === 0) throw new RangeError("division by zero");
  const sign = Math.sign(numerator) * Math.sign(denominator);
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  return sign * Math.floor((n * 2 + d) / (2 * d));
}

/** amount × rate / denominator, rounded half-up, exact even when amount × rate exceeds 2^53 (Rial). */
function mulDivRound(amount: number, rate: number, denominator: number): number {
  if (Number.isSafeInteger(amount * rate)) return divRound(amount * rate, denominator);
  const n = BigInt(amount) * BigInt(rate);
  const d = BigInt(denominator);
  const zero = BigInt(0);
  const two = BigInt(2);
  const neg = n < zero;
  const abs = neg ? -n : n;
  const q = (abs * two + d) / (two * d);
  return Number(neg ? -q : q);
}

/** Tax contained in a tax-inclusive amount: gross × rate / (1 + rate). */
export function taxFromGross(grossCents: Cents, rateBps: number): Cents {
  assertCents(grossCents);
  if (rateBps === 0) return 0;
  return mulDivRound(grossCents, rateBps, 10_000 + rateBps);
}

/** Tax to add on top of a tax-exclusive amount: net × rate. */
export function taxFromNet(netCents: Cents, rateBps: number): Cents {
  assertCents(netCents);
  return mulDivRound(netCents, rateBps, 10_000);
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) {
    assertCents(v);
    total += v;
  }
  assertCents(total, "sum");
  return total;
}

/**
 * Display unit. Amounts are always stored in minor units of the currency (× 100). Iranian rials
 * are shown and typed in **tomans** (1 toman = 10 rials), as Iranian menus and receipts do;
 * legal documents (invoices) keep rials.
 */
export const isToman = (currency: string) => currency === "IRR";
/** Stored minor units per displayed unit: 1 toman = 10 rials = 1000 minor units. */
export const displayFactor = (currency: string) => (isToman(currency) ? 1000 : 100);

const TOMAN_LABEL: Record<string, string> = { fa: "تومان", ar: "تومان", en: "Toman" };
const lang = (locale: string) => locale.slice(0, 2);

/** Name of the unit prices are typed in: "تومان" for IRR, otherwise the currency code. */
export const unitLabel = (currency: string, locale: string) =>
  isToman(currency) ? (TOMAN_LABEL[lang(locale)] ?? TOMAN_LABEL.fa) : currency;

export function formatMoney(cents: Cents, currency: string, locale = "fa"): string {
  if (isToman(currency)) {
    const tomans = Math.round(cents / 1000);
    const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(tomans);
    return `${n} ${TOMAN_LABEL[lang(locale)] ?? TOMAN_LABEL.fa}`;
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

/** Short menu price in thousand tomans: 1 319 000 tomans → "۱٬۳۱۹" (the unit is shown once). */
export function formatThousandTomans(cents: Cents, locale = "fa"): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(cents / 1_000_000);
}

/** Value for a money <input>: 12000000 IRR minor units → "12000" (tomans); 1990 EUR → "19,90". */
export function centsToInput(cents: number | null | undefined, locale: string, currency = "IRR"): string {
  if (cents == null) return "";
  if (isToman(currency)) return String(Math.round(cents / 1000));
  const s = (cents / 100).toFixed(2);
  return locale === "en" ? s : s.replace(".", ",");
}

/**
 * Parses a typed amount in the currency's display unit into stored minor units.
 * Tomans are whole numbers and may contain thousands separators ("120,000", "۱۲۰٬۰۰۰").
 */
export function parseMoneyInput(input: string, currency: string): Cents | null {
  if (!isToman(currency)) return parseMoney(input);
  const digits = normalizeDigits(input)
    .trim()
    .replace(/[\s,٬.']/g, "");
  if (!/^\d{1,10}$/.test(digits)) return null;
  return Number(digits) * 1000;
}
