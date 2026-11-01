import { randomUUID } from "node:crypto";
import { sign, unsign } from "@/server/auth/tokens";

/**
 * Two signed, httpOnly cookies identify a guest:
 * - sf_guest: the device (long-lived, survives table changes)
 * - sf_seat:  the participant at the current table session
 * Both are HMAC-signed with APP_SECRET, so a guest cannot impersonate another participant.
 */
export const GUEST_COOKIE = "sf_guest";
export const SEAT_COOKIE = "sf_seat";

const secret = () => {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 32) throw new Error("APP_SECRET must be set (32+ chars)");
  return s;
};

const base = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export const guestCookieOptions = { ...base, maxAge: 60 * 60 * 24 * 365 };
export const seatCookieOptions = { ...base, maxAge: 60 * 60 * 12 };

export const newGuestId = () => randomUUID();
export const signValue = (v: string) => sign(v, secret());
export const readSigned = (v: string | undefined) => (v ? unsign(v, secret()) : null);
