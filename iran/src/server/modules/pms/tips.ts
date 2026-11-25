import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { diningTables, restaurantMembers, staffTips, stays, users } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { emit, topics } from "@/server/infra/realtime";
import { conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { mainFolioOf, postLine } from "./folios";
import { getFeatures } from "./features";

/**
 * انعام دیجیتال: a guest leaves a tip to a named member of staff from their phone. It goes on the
 * bill (department "tip": owed to the staff, not revenue) and the manager pays it out later.
 */

export type TipStaff = { id: string; name: string; role: string; ownRoom: boolean };

/** Who can be tipped: the active team, the room's own housekeeper first. */
export async function tipStaff(db: DbOrTx, restaurantId: string, roomId: string | null): Promise<TipStaff[]> {
  const [room] = roomId
    ? await db
        .select({ hk: diningTables.housekeeperUserId })
        .from(diningTables)
        .where(and(eq(diningTables.id, roomId), eq(diningTables.restaurantId, restaurantId)))
    : [];
  const rows = await db
    .select({ id: users.id, name: users.fullName, role: restaurantMembers.role })
    .from(restaurantMembers)
    .innerJoin(users, eq(users.id, restaurantMembers.userId))
    .where(
      and(
        eq(restaurantMembers.restaurantId, restaurantId),
        eq(restaurantMembers.status, "active"),
        isNull(users.deletedAt),
        sql`${restaurantMembers.role} <> 'owner'`,
      ),
    )
    .orderBy(asc(users.fullName));
  return rows
    .map((r) => ({ ...r, role: String(r.role), ownRoom: r.id === room?.hk }))
    .sort((a, b) => Number(b.ownRoom) - Number(a.ownRoom));
}

export const tipSchema = z.object({
  staffUserId: z.string().uuid(),
  amountCents: z.coerce.number().int().positive().max(100_000_000_000),
  message: z.string().trim().max(200).optional(),
});

/** The guest's tip, charged to their bill. */
export async function leaveTip(
  db: Database,
  restaurant: { id: string; timezone: string },
  stayId: string,
  raw: z.input<typeof tipSchema>,
) {
  const v = tipSchema.parse(raw);
  const rid = restaurant.id;
  if (!(await getFeatures(db, rid)).tips.enabled) throw notFound();
  return db.transaction(async (tx) => {
    const [stay] = await tx
      .select()
      .from(stays)
      .where(and(eq(stays.id, stayId), eq(stays.restaurantId, rid)));
    if (!stay) throw notFound();
    if (stay.status !== "in_house") throw conflict("not_in_house");
    const [staff] = await tx
      .select({ id: users.id, name: users.fullName })
      .from(restaurantMembers)
      .innerJoin(users, eq(users.id, restaurantMembers.userId))
      .where(
        and(
          eq(restaurantMembers.restaurantId, rid),
          eq(restaurantMembers.userId, v.staffUserId),
          eq(restaurantMembers.status, "active"),
        ),
      );
    if (!staff) throw notFound("staff_not_found");
    const folio = await mainFolioOf(tx, rid, stay.id);
    const line = await postLine(tx, rid, restaurant.timezone, {
      folioId: folio.id,
      kind: "charge",
      department: "tip",
      description: `انعام — ${staff.name}`,
      unitCents: v.amountCents,
      amountCents: v.amountCents,
      taxRateBps: 0,
      sourceType: "tip",
      userId: null,
    });
    const [tip] = await tx
      .insert(staffTips)
      .values({
        restaurantId: rid,
        staffUserId: staff.id,
        stayId: stay.id,
        folioLineId: line.id,
        amountCents: v.amountCents,
        message: v.message || null,
      })
      .returning();
    await recordAudit(tx, {
      action: "tip.left",
      actorType: "guest",
      restaurantId: rid,
      entityType: "staff_tip",
      entityId: tip!.id,
      metadata: { amountCents: v.amountCents, staff: staff.name },
    });
    await emit(tx, { topic: topics.restaurant(rid), type: "notification.created" });
    return { staff: staff.name, amountCents: v.amountCents };
  });
}

/**
 * A tip still stands while its charge does: once the front desk voids that folio line, the guest
 * no longer pays it, so it leaves the report and is never handed over. Qualified by hand (the
 * column renders unqualified in single-table statements).
 */
const standing = sql`not exists (select 1 from "folio_lines" fl where fl.id = "staff_tips"."folio_line_id" and fl.voided_at is not null)`;

export type TipsReport = {
  staff: { userId: string; name: string; count: number; totalCents: number; unpaidCents: number }[];
  recent: {
    id: string;
    staff: string;
    amountCents: number;
    message: string | null;
    at: Date;
    paid: boolean;
    room: string | null;
  }[];
};

export async function tipsReport(
  db: DbOrTx,
  ctx: RestaurantContext,
  from: Date,
  to: Date,
): Promise<TipsReport> {
  assertCan(ctx, "folio.post");
  const rid = ctx.restaurant.id;
  const range = and(
    eq(staffTips.restaurantId, rid),
    gte(staffTips.createdAt, from),
    lte(staffTips.createdAt, to),
    standing,
  );
  const [byStaff, recent] = await Promise.all([
    db
      .select({
        userId: staffTips.staffUserId,
        name: users.fullName,
        count: sql<number>`count(*)::int`,
        totalCents: sql<number>`sum(${staffTips.amountCents})`.mapWith(Number),
        unpaidCents:
          sql<number>`coalesce(sum(${staffTips.amountCents}) filter (where ${staffTips.paidOutAt} is null), 0)`.mapWith(
            Number,
          ),
      })
      .from(staffTips)
      .innerJoin(users, eq(users.id, staffTips.staffUserId))
      .where(range)
      .groupBy(staffTips.staffUserId, users.fullName)
      .orderBy(desc(sql`sum(${staffTips.amountCents})`)),
    db
      .select({
        id: staffTips.id,
        staff: users.fullName,
        amountCents: staffTips.amountCents,
        message: staffTips.message,
        at: staffTips.createdAt,
        paidOutAt: staffTips.paidOutAt,
        room: diningTables.label,
      })
      .from(staffTips)
      .innerJoin(users, eq(users.id, staffTips.staffUserId))
      .leftJoin(stays, eq(stays.id, staffTips.stayId))
      .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
      .where(range)
      .orderBy(desc(staffTips.createdAt))
      .limit(100),
  ]);
  return {
    staff: byStaff,
    recent: recent.map(({ paidOutAt, ...r }) => ({ ...r, paid: !!paidOutAt })),
  };
}

/** Marks the unpaid tips of one person as handed over. */
export async function payOutTips(db: DbOrTx, ctx: RestaurantContext, staffUserId: string) {
  assertCan(ctx, "folio.adjust");
  const rid = ctx.restaurant.id;
  const paid = await db
    .update(staffTips)
    .set({ paidOutAt: new Date(), paidOutByUserId: ctx.user.id })
    .where(
      and(
        eq(staffTips.restaurantId, rid),
        eq(staffTips.staffUserId, staffUserId),
        isNull(staffTips.paidOutAt),
        standing,
      ),
    )
    .returning({ id: staffTips.id, amountCents: staffTips.amountCents });
  const total = paid.reduce((s, p) => s + p.amountCents, 0);
  await recordAudit(db, {
    action: "tip.paid_out",
    actorUserId: ctx.user.id,
    restaurantId: rid,
    entityType: "user",
    entityId: staffUserId,
    metadata: { count: paid.length, totalCents: total },
  });
  return { count: paid.length, totalCents: total };
}
