import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { authSessions, kitchenStations, restaurantMembers, teamSections, users } from "@/server/db/schema";
import type { DbOrTx } from "@/server/db/client";
import { STATION_JOBS, type Job } from "@/lib/jobs";
import { recordAudit } from "@/server/audit";
import { hashPassword } from "@/server/auth/password";
import {
  canAssignRole,
  JOB_PRESETS,
  resolvePermissions,
  ROLE_PERMISSIONS,
  type MemberRole,
} from "@/server/auth/permissions";
import { assertStaffQuota, lockRestaurant } from "@/server/entitlements";
import { AppError, forbidden, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import {
  addMemberSchema,
  memberJobSchema,
  updateMemberSchema,
  type AddMemberInput,
  type MemberJobInput,
  type UpdateMemberInput,
} from "./schemas";
import { teamJobById } from "@/server/modules/team/jobs";

export async function listMembers(db: Database, ctx: RestaurantContext) {
  assertCan(ctx, "members.manage");
  const rows = await db
    .select({
      id: restaurantMembers.id,
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      role: restaurantMembers.role,
      status: restaurantMembers.status,
      grantedPermissions: restaurantMembers.grantedPermissions,
      revokedPermissions: restaurantMembers.revokedPermissions,
      job: restaurantMembers.job,
      teamJobId: restaurantMembers.teamJobId,
      stationId: restaurantMembers.stationId,
      sectionIds: restaurantMembers.sectionIds,
      lastLoginAt: users.lastLoginAt,
      createdAt: restaurantMembers.createdAt,
    })
    .from(restaurantMembers)
    .innerJoin(users, eq(users.id, restaurantMembers.userId))
    .where(eq(restaurantMembers.restaurantId, ctx.restaurant.id))
    .orderBy(
      sql`case ${restaurantMembers.role} when 'owner' then 0 when 'admin' then 1 else 2 end`,
      asc(users.fullName),
    );
  const access = new Map(
    (
      await db
        .select({ id: teamSections.id, permissions: teamSections.permissions })
        .from(teamSections)
        .where(eq(teamSections.restaurantId, ctx.restaurant.id))
    ).map((s) => [s.id, s.permissions]),
  );
  return rows.map((r) => {
    const fromSections = r.sectionIds.map((id) => access.get(id)).filter((p): p is string[] => p != null);
    return {
      ...r,
      /** Access set by a section (the per-member permissions then do not apply). */
      accessFromSection: r.role === "staff" && fromSections.length > 0,
      effectivePermissions: [
        ...resolvePermissions(r.role, r.grantedPermissions, r.revokedPermissions, fromSections),
      ],
    };
  });
}

/**
 * Adds a team member. Existing accounts are linked (their password is never touched);
 * new accounts are created with the initial password chosen by the manager.
 */
export async function addMember(db: Database, ctx: RestaurantContext, raw: AddMemberInput) {
  assertCan(ctx, "members.manage");
  const parsed = addMemberSchema.parse(raw);
  const teamJob = parsed.teamJobId ? await teamJobById(db, ctx.restaurant.id, parsed.teamJobId) : null;
  const input = teamJob ? { ...parsed, job: teamJob.baseJob } : parsed;
  const preset = input.job ? jobValues(ctx, input.job) : null;
  const role = preset?.role ?? input.role;
  if (!canAssignRole(ctx.role, role)) throw forbidden("role_not_assignable");

  const passwordHash = input.password ? await hashPassword(input.password) : null;

  return db.transaction(async (tx) => {
    await lockRestaurant(tx, ctx.restaurant.id);
    await assertStaffQuota(tx, ctx.restaurant.id);

    let [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${input.email}`)
      .limit(1);
    let created = false;
    if (!user) {
      if (!input.fullName) throw new AppError("VALIDATION", "name_required", { field: "fullName" });
      if (!passwordHash) throw new AppError("VALIDATION", "password_required", { field: "password" });
      [user] = await tx
        .insert(users)
        .values({ email: input.email, fullName: input.fullName, passwordHash })
        .returning({ id: users.id });
      created = true;
    }

    const [existing] = await tx
      .select({ id: restaurantMembers.id })
      .from(restaurantMembers)
      .where(
        and(eq(restaurantMembers.restaurantId, ctx.restaurant.id), eq(restaurantMembers.userId, user!.id)),
      );
    if (existing) throw new AppError("CONFLICT", "already_member", { field: "email" });

    const [member] = await tx
      .insert(restaurantMembers)
      .values({
        restaurantId: ctx.restaurant.id,
        userId: user!.id,
        role,
        ...(preset && input.job
          ? {
              ...preset,
              job: input.job,
              teamJobId: teamJob?.id ?? null,
              stationId: await stationOf(tx, ctx, input.job, input.stationId ?? null),
            }
          : {}),
      })
      .returning();
    await recordAudit(tx, {
      action: "member.added",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "restaurant_member",
      entityId: member!.id,
      metadata: { role, job: input.job ?? null, email: input.email, accountCreated: created },
    });
    return { member: member!, accountCreated: created };
  });
}

async function loadManageableMember(db: Database, ctx: RestaurantContext, memberId: string) {
  const [m] = await db
    .select()
    .from(restaurantMembers)
    .where(and(eq(restaurantMembers.id, memberId), eq(restaurantMembers.restaurantId, ctx.restaurant.id)));
  if (!m) throw notFound();
  if (m.role === "owner") throw forbidden("owner_protected");
  if (m.userId === ctx.user.id) throw forbidden("cannot_edit_self");
  // An admin can only manage staff; owners can manage admins and staff.
  if (!canAssignRole(ctx.role, m.role as MemberRole)) throw forbidden("role_not_assignable");
  return m;
}

export async function updateMember(
  db: Database,
  ctx: RestaurantContext,
  memberId: string,
  raw: UpdateMemberInput,
) {
  assertCan(ctx, "members.manage");
  const input = updateMemberSchema.parse(raw);
  const current = await loadManageableMember(db, ctx, memberId);
  if (!canAssignRole(ctx.role, input.role)) throw forbidden("role_not_assignable");

  // Only store real deltas from the role defaults; an actor cannot grant what they don't have.
  const defaults = ROLE_PERMISSIONS[input.role];
  const keep = input.keepPermissions && input.role === current.role;
  const granted = keep
    ? current.grantedPermissions
    : input.grantedPermissions.filter((p) => !defaults.has(p) && ctx.permissions.has(p));
  const revoked = keep ? current.revokedPermissions : input.revokedPermissions.filter((p) => defaults.has(p));

  return db.transaction(async (tx) => {
    if (current.status !== "active" && input.status === "active") {
      await lockRestaurant(tx, ctx.restaurant.id);
      await assertStaffQuota(tx, ctx.restaurant.id);
    }
    const [updated] = await tx
      .update(restaurantMembers)
      .set({
        role: input.role,
        grantedPermissions: granted,
        revokedPermissions: revoked,
        status: input.status,
      })
      .where(eq(restaurantMembers.id, memberId))
      .returning();
    await recordAudit(tx, {
      action: "member.updated",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "restaurant_member",
      entityId: memberId,
      metadata: {
        from: { role: current.role, status: current.status },
        to: { role: input.role, status: input.status },
        granted,
        revoked,
      },
    });
    return updated!;
  });
}

export async function removeMember(db: Database, ctx: RestaurantContext, memberId: string) {
  assertCan(ctx, "members.manage");
  const m = await loadManageableMember(db, ctx, memberId);
  await db.transaction(async (tx) => {
    await tx.delete(restaurantMembers).where(eq(restaurantMembers.id, memberId));
    // If the user has no other restaurant, end their sessions so access stops immediately.
    const [other] = await tx
      .select({ id: restaurantMembers.id })
      .from(restaurantMembers)
      .where(eq(restaurantMembers.userId, m.userId))
      .limit(1);
    if (!other) await tx.delete(authSessions).where(eq(authSessions.userId, m.userId));
    await recordAudit(tx, {
      action: "member.removed",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "restaurant_member",
      entityId: memberId,
      metadata: { userId: m.userId, role: m.role },
    });
  });
}

/** Role and permission deltas of a job, limited to what the actor may grant. */
function jobValues(ctx: RestaurantContext, job: Job) {
  const p = JOB_PRESETS[job];
  return {
    role: p.role,
    grantedPermissions: p.granted.filter((x) => ctx.permissions.has(x)),
    revokedPermissions: [...p.revoked],
  };
}

/** Bar / kitchen members may be tied to one of the restaurant's stations. */
async function stationOf(tx: DbOrTx, ctx: RestaurantContext, job: Job | null, stationId: string | null) {
  if (!job || !STATION_JOBS.includes(job) || !stationId) return null;
  const [s] = await tx
    .select({ id: kitchenStations.id })
    .from(kitchenStations)
    .where(and(eq(kitchenStations.id, stationId), eq(kitchenStations.restaurantId, ctx.restaurant.id)));
  if (!s) throw new AppError("VALIDATION", "invalid_station", { field: "stationId" });
  return s.id;
}

/**
 * Gives a member a job: its permission preset (role, grants, revocations) and, for bar and
 * kitchen, the station whose tickets they see. `null` keeps their permissions and clears the job.
 */
export async function setMemberJob(
  db: Database,
  ctx: RestaurantContext,
  memberId: string,
  raw: MemberJobInput,
) {
  assertCan(ctx, "members.manage");
  const parsed = memberJobSchema.parse(raw);
  const teamJob = parsed.teamJobId ? await teamJobById(db, ctx.restaurant.id, parsed.teamJobId) : null;
  const input = teamJob ? { ...parsed, job: teamJob.baseJob } : parsed;
  const current = await loadManageableMember(db, ctx, memberId);
  const preset = input.job ? jobValues(ctx, input.job) : null;
  if (preset && !canAssignRole(ctx.role, preset.role)) throw forbidden("role_not_assignable");
  return db.transaction(async (tx) => {
    const stationId = await stationOf(tx, ctx, input.job, input.stationId);
    const [updated] = await tx
      .update(restaurantMembers)
      .set({ ...(preset ?? {}), job: input.job, teamJobId: teamJob?.id ?? null, stationId })
      .where(eq(restaurantMembers.id, memberId))
      .returning();
    await recordAudit(tx, {
      action: "member.updated",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "restaurant_member",
      entityId: memberId,
      metadata: { from: { job: current.job, role: current.role }, to: { job: input.job, stationId } },
    });
    return updated!;
  });
}
