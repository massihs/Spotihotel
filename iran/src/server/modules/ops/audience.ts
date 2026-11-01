import { createHash } from "node:crypto";
import { desc, gte, lt, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { siteHits } from "@/server/db/schema";

/** Pages counted: the public site, never the dashboards or a guest's table. */
const TRACKED = /^\/(?:restaurants|pricing|radio|signup|login|r\/[^/]+(?:\/(?:order|book|queue))?)?\/?$/;
const stripLocale = (path: string) => path.replace(/^\/(?:fa|en|ar|fr)(?=\/|$)/, "") || "/";
const BOT = /bot|crawl|spider|slurp|preview|monitor|curl|wget|python|headless/i;

export function isTrackedPath(path: string) {
  return TRACKED.test(stripLocale(path));
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export function visitorHash(ip: string, ua: string, at: Date) {
  return createHash("sha256")
    .update(`${process.env.APP_SECRET ?? ""}|${day(at)}|${ip}|${ua}`)
    .digest("hex")
    .slice(0, 32);
}

export async function recordHit(
  db: Database,
  hit: { path: string; referrer?: string | null; ip: string; ua: string; locale?: string | null },
  now = new Date(),
) {
  const path = hit.path.split("?")[0]!.slice(0, 200);
  if (!isTrackedPath(path) || BOT.test(hit.ua) || !hit.ua) return false;
  let referrer: string | null = null;
  try {
    const host = hit.referrer ? new URL(hit.referrer).hostname : null;
    const own = process.env.APP_URL ? new URL(process.env.APP_URL).hostname : null;
    referrer = host && host !== own ? host.replace(/^www\./, "").slice(0, 120) : null;
  } catch {}
  const device = /mobile|android|iphone|ipad/i.test(hit.ua) ? "mobile" : "desktop";
  await db.insert(siteHits).values({
    at: now,
    path: stripLocale(path),
    referrer,
    visitor: visitorHash(hit.ip, hit.ua, now),
    device,
    locale: hit.locale?.slice(0, 8) ?? null,
  });
  // Prune now and then (≈1 request in 200).
  if (Math.random() < 0.005)
    await db.delete(siteHits).where(lt(siteHits.at, new Date(now.getTime() - 90 * 86_400_000)));
  return true;
}

export async function getAudience(db: Database, days = 30, now = new Date()) {
  const since = new Date(now.getTime() - days * 86_400_000);
  const where = gte(siteHits.at, since);
  const [byDay, pages, referrers, devices, totals] = await Promise.all([
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${siteHits.at} at time zone 'Asia/Tehran'), 'YYYY-MM-DD')`,
        views: sql<number>`count(*)`.mapWith(Number),
        visitors: sql<number>`count(distinct ${siteHits.visitor})`.mapWith(Number),
      })
      .from(siteHits)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({ path: siteHits.path, views: sql<number>`count(*)`.mapWith(Number) })
      .from(siteHits)
      .where(where)
      .groupBy(siteHits.path)
      .orderBy(desc(sql`2`))
      .limit(10),
    db
      .select({ referrer: siteHits.referrer, views: sql<number>`count(*)`.mapWith(Number) })
      .from(siteHits)
      .where(sql`${where} and ${siteHits.referrer} is not null`)
      .groupBy(siteHits.referrer)
      .orderBy(desc(sql`2`))
      .limit(8),
    db
      .select({ device: siteHits.device, views: sql<number>`count(*)`.mapWith(Number) })
      .from(siteHits)
      .where(where)
      .groupBy(siteHits.device),
    db
      .select({
        views: sql<number>`count(*)`.mapWith(Number),
        visitors: sql<number>`count(distinct (${siteHits.visitor}))`.mapWith(Number),
      })
      .from(siteHits)
      .where(where),
  ]);
  return {
    byDay,
    pages,
    referrers,
    devices,
    views: totals[0]?.views ?? 0,
    visitors: totals[0]?.visitors ?? 0,
  };
}
