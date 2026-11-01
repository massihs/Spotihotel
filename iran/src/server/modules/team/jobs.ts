import { and, asc, eq, sql } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { restaurantMembers, teamJobs } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { isUuid } from "@/lib/ids";
import { JOBS, type Job } from "@/lib/jobs";
import { TEAM_JOB_ICONS, type TeamJobIcon } from "@/lib/team-jobs";

type Default = { base: Job; icon: TeamJobIcon; key: string };

/** The jobs a new team starts with; a hotel gets its front desk, housekeeping and room service. */
const DEFAULTS: Record<string, Default[]> = {
  restaurant: [
    { base: "manager", icon: "crown", key: "manager.name" },
    { base: "cashier", icon: "calculator", key: "cashier.name" },
    { base: "waiter", icon: "hand-platter", key: "waiter.name" },
    { base: "bar", icon: "coffee", key: "bar.name" },
    { base: "kitchen", icon: "chef-hat", key: "kitchen.name" },
  ],
  hotel: [
    { base: "manager", icon: "crown", key: "manager.name" },
    { base: "cashier", icon: "concierge", key: "hotel.reception" },
    { base: "waiter", icon: "bed", key: "hotel.housekeeping" },
    { base: "waiter", icon: "hand-platter", key: "hotel.roomService" },
    { base: "kitchen", icon: "chef-hat", key: "kitchen.name" },
    { base: "bar", icon: "coffee", key: "bar.name" },
  ],
};

async function defaultNames(locale: string) {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const messages = (await import(`../../../../messages/${l}.json`)).default;
  return createTranslator({ locale: l, messages, namespace: "team.jobs" });
}

/** The restaurant's jobs, in order; the defaults are written the first time the team is opened. */
export async function listTeamJobs(db: Database, ctx: RestaurantContext) {
  assertCan(ctx, "members.manage");
  const rows = await teamJobsOf(db, ctx.restaurant.id);
  if (rows.length) return rows;
  const t = await defaultNames(ctx.restaurant.defaultLocale);
  const defaults = DEFAULTS[ctx.restaurant.kind] ?? DEFAULTS.restaurant!;
  return db.transaction(async (tx) => {
    // Two tabs opening the team at once write the defaults once.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`team_jobs:${ctx.restaurant.id}`}))`);
    const again = await teamJobsOf(tx, ctx.restaurant.id);
    if (again.length) return again;
    await tx.insert(teamJobs).values(
      defaults.map((d, i) => ({
        restaurantId: ctx.restaurant.id,
        name: t(d.key as "manager.name"),
        icon: d.icon,
        baseJob: d.base,
        position: i,
      })),
    );
    return teamJobsOf(tx, ctx.restaurant.id);
  });
}

export function teamJobsOf(db: DbOrTx, restaurantId: string) {
  return db
    .select({ id: teamJobs.id, name: teamJobs.name, icon: teamJobs.icon, baseJob: teamJobs.baseJob })
    .from(teamJobs)
    .where(eq(teamJobs.restaurantId, restaurantId))
    .orderBy(asc(teamJobs.position), asc(teamJobs.createdAt));
}

/** A job of this restaurant, or not found. */
export async function teamJobById(db: DbOrTx, restaurantId: string, id: string) {
  if (!isUuid(id)) throw notFound();
  const [row] = await db
    .select({ id: teamJobs.id, baseJob: teamJobs.baseJob })
    .from(teamJobs)
    .where(and(eq(teamJobs.id, id), eq(teamJobs.restaurantId, restaurantId)));
  if (!row) throw notFound();
  return { id: row.id, baseJob: row.baseJob as Job };
}

export const teamJobSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(48),
  icon: z.enum(TEAM_JOB_ICONS),
  baseJob: z.enum(JOBS),
});

/** Creates or renames a job. Its base cannot change while members hold it (their access would). */
export async function saveTeamJob(db: Database, ctx: RestaurantContext, raw: z.input<typeof teamJobSchema>) {
  assertCan(ctx, "members.manage");
  const input = teamJobSchema.parse(raw);
  return db.transaction(async (tx) => {
    if (input.id) {
      const current = await teamJobById(tx, ctx.restaurant.id, input.id);
      if (current.baseJob !== input.baseJob) {
        const [held] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(restaurantMembers)
          .where(eq(restaurantMembers.teamJobId, input.id));
        if (held && held.n > 0) throw conflict("job_in_use");
      }
      await tx
        .update(teamJobs)
        .set({ name: input.name, icon: input.icon, baseJob: input.baseJob })
        .where(eq(teamJobs.id, input.id));
    } else {
      const [last] = await tx
        .select({ p: sql<number>`coalesce(max(${teamJobs.position}), -1)::int` })
        .from(teamJobs)
        .where(eq(teamJobs.restaurantId, ctx.restaurant.id));
      await tx.insert(teamJobs).values({
        restaurantId: ctx.restaurant.id,
        name: input.name,
        icon: input.icon,
        baseJob: input.baseJob,
        position: (last?.p ?? -1) + 1,
      });
    }
    await recordAudit(tx, {
      action: input.id ? "team_job.updated" : "team_job.created",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      metadata: { name: input.name, baseJob: input.baseJob },
    });
  });
}

/** Removes a job; its members keep their access and show the base job's default. */
export async function deleteTeamJob(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "members.manage");
  await teamJobById(db, ctx.restaurant.id, id);
  await db.transaction(async (tx) => {
    await tx
      .update(restaurantMembers)
      .set({ teamJobId: null })
      .where(and(eq(restaurantMembers.restaurantId, ctx.restaurant.id), eq(restaurantMembers.teamJobId, id)));
    await tx.delete(teamJobs).where(eq(teamJobs.id, id));
    await recordAudit(tx, {
      action: "team_job.deleted",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityId: id,
    });
  });
}
