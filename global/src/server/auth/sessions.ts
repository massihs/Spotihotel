import { and, eq, gt, lt } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { authSessions, users } from "@/server/db/schema";
import { newSessionToken, sha256 } from "./tokens";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Extend the session when less than this remains (sliding expiration). */
const RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  locale: string | null;
  isSuperAdmin: boolean;
};

export type ValidatedSession = {
  sessionId: string;
  expiresAt: Date;
  renewed: boolean;
  user: SessionUser;
};

export async function createAuthSession(
  db: DbOrTx,
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  const { token, tokenHash } = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const [row] = await db
    .insert(authSessions)
    .values({
      userId,
      tokenHash,
      expiresAt,
      ip: meta.ip?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 512) ?? null,
    })
    .returning({ id: authSessions.id });
  return { token, expiresAt, sessionId: row!.id };
}

export async function validateAuthSession(
  db: DbOrTx,
  token: string | undefined | null,
): Promise<ValidatedSession | null> {
  if (!token || token.length < 20 || token.length > 128) return null;
  const now = new Date();
  const [row] = await db
    .select({
      sessionId: authSessions.id,
      expiresAt: authSessions.expiresAt,
      user: {
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        locale: users.locale,
        isSuperAdmin: users.isSuperAdmin,
        status: users.status,
        deletedAt: users.deletedAt,
      },
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.tokenHash, sha256(token)), gt(authSessions.expiresAt, now)))
    .limit(1);

  if (!row) return null;
  if (row.user.status !== "active" || row.user.deletedAt) {
    await db.delete(authSessions).where(eq(authSessions.id, row.sessionId));
    return null;
  }

  let expiresAt = row.expiresAt;
  let renewed = false;
  if (expiresAt.getTime() - now.getTime() < RENEW_THRESHOLD_MS) {
    expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    renewed = true;
    await db
      .update(authSessions)
      .set({ expiresAt, lastSeenAt: now })
      .where(eq(authSessions.id, row.sessionId));
  }

  const { status: _s, deletedAt: _d, ...user } = row.user;
  return { sessionId: row.sessionId, expiresAt, renewed, user };
}

export async function revokeAuthSession(db: DbOrTx, sessionId: string) {
  await db.delete(authSessions).where(eq(authSessions.id, sessionId));
}

export async function revokeAllUserSessions(db: DbOrTx, userId: string) {
  await db.delete(authSessions).where(eq(authSessions.userId, userId));
}

export async function purgeExpiredSessions(db: DbOrTx) {
  await db.delete(authSessions).where(lt(authSessions.expiresAt, new Date()));
}
