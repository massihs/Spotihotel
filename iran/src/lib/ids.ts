import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * URL-safe random token (base62). 22 chars ≈ 131 bits of entropy.
 * Used for QR codes, invoice links and other unguessable public identifiers.
 */
export function randomToken(length = 22): string {
  const out: string[] = [];
  // Rejection sampling to avoid modulo bias.
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 248) out.push(ALPHABET[byte % 62]!);
      if (out.length === length) break;
    }
  }
  return out.join("");
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
