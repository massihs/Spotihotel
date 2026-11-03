import { normalizeDigits } from "@/lib/money";

/**
 * Iranian national code (کد ملی): 10 digits whose last one is a check digit
 * (weighted sum of the first nine, mod 11). Persian and Arabic digits are accepted.
 */
export function isIranNationalCode(raw: string) {
  const v = normalizeDigits(raw).replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(v) || /^(\d)\1{9}$/.test(v)) return false;
  const digits = v.split("").map(Number);
  const sum = digits.slice(0, 9).reduce((s, d, i) => s + d * (10 - i), 0);
  const r = sum % 11;
  const check = r < 2 ? r : 11 - r;
  return check === digits[9];
}
