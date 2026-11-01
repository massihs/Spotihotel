/** Persian (۰-۹) and Arabic-Indic (٠-٩) digits → ASCII. */
export function asciiDigits(s: string) {
  return s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/**
 * Normalizes an Iranian mobile number to the 09XXXXXXXXX form, accepting +98 / 0098 / 98
 * prefixes, spaces, dashes and Persian digits. Returns null when it is not a mobile number.
 */
export function normalizeIranMobile(input: string): string | null {
  const digits = asciiDigits(input).replace(/[\s().-]/g, "");
  const m = /^(?:\+98|0098|98|0)?(9\d{9})$/.exec(digits);
  return m ? `0${m[1]}` : null;
}
