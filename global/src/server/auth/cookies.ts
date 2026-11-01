/** Shared between proxy (edge-safe, no DB) and server code. */
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-sf_session" : "sf_session";
export const SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_COOKIE_MAX_AGE,
};
