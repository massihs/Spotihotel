import { createHash } from "node:crypto";
import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { appErrors } from "@/server/db/schema";
import { sms } from "@/server/infra/sms";

/** How often one error may text the admin, and how many texts per hour at most overall. */
const ALERT_EVERY_MS = 60 * 60_000;
const MAX_ALERTS_PER_HOUR = 5;

export type ErrorReport = {
  message: string;
  route: string;
  method?: string | null;
  kind?: string | null;
  digest?: string | null;
  stack?: string | null;
};

/** Same error on the same route → same row. Numbers and ids are blanked so variants group. */
export function fingerprint(message: string, route: string) {
  const norm = message.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<id>").replace(/\d+/g, "<n>");
  return createHash("sha256").update(`${route}\n${norm}`).digest("hex").slice(0, 64);
}

/**
 * Stores (or counts) a server error and texts the admin (ALERT_PHONE) for a new or recurring
 * one, at most once an hour per error. Never throws: it runs inside the error handler.
 */
export async function recordError(db: Database, e: ErrorReport, now = new Date()) {
  try {
    const message = (e.message || "Error").slice(0, 500);
    const route = (e.route || "?").slice(0, 300);
    const fp = fingerprint(message, route);
    const [row] = await db
      .insert(appErrors)
      .values({
        fingerprint: fp,
        message,
        route,
        method: e.method?.slice(0, 10) ?? null,
        kind: e.kind?.slice(0, 16) ?? null,
        digest: e.digest?.slice(0, 64) ?? null,
        stack: e.stack?.slice(0, 4000) ?? null,
        firstAt: now,
        lastAt: now,
      })
      .onConflictDoUpdate({
        target: appErrors.fingerprint,
        set: {
          count: sql`${appErrors.count} + 1`,
          lastAt: now,
          digest: e.digest?.slice(0, 64) ?? null,
          stack: e.stack?.slice(0, 4000) ?? sql`${appErrors.stack}`,
          resolvedAt: null,
        },
      })
      .returning({ id: appErrors.id, count: appErrors.count });
    if (row) await maybeAlert(db, row.id, message, route, row.count, now);
  } catch (err) {
    console.error("[errors] could not record", err);
  }
}

async function maybeAlert(
  db: Database,
  id: string,
  message: string,
  route: string,
  count: number,
  now: Date,
) {
  const phone = process.env.ALERT_PHONE;
  if (!phone) return;
  const hourAgo = new Date(now.getTime() - ALERT_EVERY_MS);
  const [{ n }] = (await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(appErrors)
    .where(gte(appErrors.alertedAt, hourAgo))) as [{ n: number }];
  if (n >= MAX_ALERTS_PER_HOUR) return;
  // Claim the alert atomically so two servers do not both text.
  const [claimed] = await db
    .update(appErrors)
    .set({ alertedAt: now })
    .where(and(eq(appErrors.id, id), or(isNull(appErrors.alertedAt), lt(appErrors.alertedAt, hourAgo))))
    .returning({ id: appErrors.id });
  if (!claimed) return;
  const text = `Spotifood: erreur serveur (${count}x)\n${route}\n${message.slice(0, 120)}`;
  await sms()
    .send(phone, text)
    .catch((err) => console.error("[errors] alert sms failed", err));
}

export async function listErrors(db: Database, opts: { open?: boolean } = {}) {
  return db
    .select()
    .from(appErrors)
    .where(opts.open ? isNull(appErrors.resolvedAt) : undefined)
    .orderBy(desc(appErrors.lastAt))
    .limit(200);
}

export async function resolveError(db: Database, id: string) {
  await db.update(appErrors).set({ resolvedAt: new Date() }).where(eq(appErrors.id, id));
}
