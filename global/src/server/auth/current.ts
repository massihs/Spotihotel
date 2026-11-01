import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { loadRestaurantContext, type RestaurantContext } from "@/server/tenancy";
import type { Permission } from "./permissions";
import { SESSION_COOKIE, sessionCookieOptions } from "./cookies";
import { createAuthSession, revokeAuthSession, validateAuthSession } from "./sessions";

/** Current session, memoized for the duration of one request. */
export const getCurrentSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  // Session validation depends on the current time: it must never be part of a prerendered shell.
  await connection();
  return validateAuthSession(db, token);
});

export async function getCurrentUser() {
  return (await getCurrentSession())?.user ?? null;
}

export async function requireUser() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session.user;
}

export async function requireSuperAdmin() {
  const user = await requireUser();
  if (!user.isSuperAdmin) notFound();
  return user;
}

/**
 * Loads the tenant context for a dashboard page. Unknown or foreign restaurants
 * render a 404 (never reveal that another tenant's id exists).
 */
export const requireRestaurant = cache(
  async (restaurantId: string, permission?: Permission): Promise<RestaurantContext> => {
    const user = await requireUser();
    try {
      const ctx = await loadRestaurantContext(db, user, restaurantId);
      if (permission && !ctx.permissions.has(permission)) redirect(`/dashboard/${restaurantId}`);
      return ctx;
    } catch (e) {
      if (isAppError(e) && e.code === "TENANT_SUSPENDED") redirect("/dashboard/suspended");
      if (isAppError(e) && e.code === "NOT_FOUND") notFound();
      throw e;
    }
  },
);

export async function requestMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}

/** For server actions / route handlers only (cookies are read-only during render). */
export async function startSession(userId: string) {
  const meta = await requestMeta();
  const { token } = await createAuthSession(db, userId, meta);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
}

export async function endSession() {
  const session = await getCurrentSession();
  if (session) await revokeAuthSession(db, session.sessionId);
  (await cookies()).delete(SESSION_COOKIE);
}
