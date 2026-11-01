import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { randomToken } from "@/lib/ids";

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export function newSessionToken(): { token: string; tokenHash: string } {
  const token = randomToken(43); // ~256 bits
  return { token, tokenHash: sha256(token) };
}

/** HMAC signature for small values stored in cookies (e.g. the guest id). */
export function sign(value: string, secret: string): string {
  const mac = createHmac("sha256", secret).update(value).digest("base64url");
  return `${value}.${mac}`;
}

export function unsign(signed: string, secret: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const expected = Buffer.from(sign(value, secret).slice(idx + 1));
  const actual = Buffer.from(signed.slice(idx + 1));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return value;
}
