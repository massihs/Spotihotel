import "server-only";
import { and, desc, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  deskShifts,
  diningTables,
  folioLines,
  folios,
  hotelAccounts,
  hotelGuests,
  pmsSettings,
  restaurantMembers,
  stays,
  users,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict, notFound, validation } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { getPmsSettings } from "./setup";
import { folioView } from "./folios";
import type { Table } from "./desk-reports";

/**
 * The front desk cashier (صندوق): each receptionist opens a shift with a float, takes payments on
 * folios (in the hotel's currency or a foreign one), then closes the shift by counting the cash
 * and handing the drawer over (تحویل صندوق). The shift's expected takings are snapshotted then.
 */

const MAX = 1_000_000_000_000;

// ─── Settings ────────────────────────────────────────────────────────────────

export const cashierSettingsSchema = z.object({
  deskFloatCents: z.coerce.number().int().min(0).max(MAX),
  currencies: z
    .array(
      z.object({
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{3}$/),
        rateCents: z.coerce.number().int().min(1).max(MAX),
      }),
    )
    .max(12)
    .refine((l) => new Set(l.map((c) => c.code)).size === l.length, "duplicate_currency"),
});

export async function cashierSettings(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "folio.post");
  const s = await getPmsSettings(db, ctx.restaurant.id, ctx.restaurant.timezone);
  return { deskFloatCents: s.deskFloatCents, currencies: s.currencies };
}

export async function saveCashierSettings(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof cashierSettingsSchema>,
) {
  assertCan(ctx, "folio.adjust");
  const input = cashierSettingsSchema.parse(raw);
  await getPmsSettings(db, ctx.restaurant.id, ctx.restaurant.timezone);
  await db.update(pmsSettings).set(input).where(eq(pmsSettings.restaurantId, ctx.restaurant.id));
  await recordAudit(db, {
    action: "pms.cashier_settings_updated",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "pms_settings",
    entityId: ctx.restaurant.id,
    metadata: input,
  });
}

// ─── Shifts ──────────────────────────────────────────────────────────────────

/** What a receptionist took since `from` (until `to`): by method, and the foreign cash by currency. */
export async function takingsOf(db: DbOrTx, rid: string, userId: string, from: Date, to?: Date) {
  const rows = await db
    .select({
      method: folioLines.method,
      currency: folioLines.currency,
      total: sql<number>`coalesce(sum(-${folioLines.amountCents}), 0)::bigint`.mapWith(Number),
      foreign:
        sql<number>`coalesce(sum(case when ${folioLines.amountCents} < 0 then ${folioLines.foreignCents} else -${folioLines.foreignCents} end), 0)::bigint`.mapWith(
          Number,
        ),
      count: sql<number>`count(*)::int`,
    })
    .from(folioLines)
    .where(
      and(
        eq(folioLines.restaurantId, rid),
        eq(folioLines.kind, "payment"),
        isNull(folioLines.voidedAt),
        eq(folioLines.postedByUserId, userId),
        gte(folioLines.createdAt, from),
        to ? lte(folioLines.createdAt, to) : undefined,
      ),
    )
    .groupBy(folioLines.method, folioLines.currency);
  const byMethod: Record<string, number> = {};
  const foreign: Record<string, number> = {};
  let count = 0;
  for (const r of rows) {
    count += r.count;
    if (r.currency) foreign[r.currency] = (foreign[r.currency] ?? 0) + r.foreign;
    else byMethod[r.method ?? "cash"] = (byMethod[r.method ?? "cash"] ?? 0) + r.total;
  }
  return { byMethod, foreign, count };
}

/** This receptionist's open shift with its takings so far, or null. */
export async function currentShift(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "folio.post");
  const [s] = await db
    .select()
    .from(deskShifts)
    .where(
      and(
        eq(deskShifts.restaurantId, ctx.restaurant.id),
        eq(deskShifts.userId, ctx.user.id),
        isNull(deskShifts.closedAt),
      ),
    );
  if (!s) return null;
  const takings = await takingsOf(db, ctx.restaurant.id, ctx.user.id, s.openedAt);
  return {
    ...s,
    takings,
    expectedCashCents: s.openingFloatCents + (takings.byMethod.cash ?? 0),
  };
}

export async function openShift(db: Database, ctx: RestaurantContext, raw: { floatCents?: number | null }) {
  assertCan(ctx, "folio.post");
  const settings = await getPmsSettings(db, ctx.restaurant.id, ctx.restaurant.timezone);
  const floatCents = z.coerce
    .number()
    .int()
    .min(0)
    .max(MAX)
    .parse(raw.floatCents ?? settings.deskFloatCents);
  try {
    const [s] = await db
      .insert(deskShifts)
      .values({ restaurantId: ctx.restaurant.id, userId: ctx.user.id, openingFloatCents: floatCents })
      .returning();
    await recordAudit(db, {
      action: "desk_shift.opened",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "desk_shift",
      entityId: s!.id,
      metadata: { floatCents },
    });
    return s!;
  } catch (e) {
    if (String((e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code) === "23505")
      throw conflict("shift_already_open");
    throw e;
  }
}

export const closeShiftSchema = z.object({
  countedCashCents: z.coerce.number().int().min(0).max(MAX),
  countedForeign: z
    .record(z.string().regex(/^[A-Z]{3}$/), z.coerce.number().int().min(0).max(MAX))
    .default({}),
  handedToUserId: z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v && isUuid(v) ? v : null)),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
});

/** Counts the drawer and hands it over: the expected takings are frozen with the count. */
export async function closeShift(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof closeShiftSchema>,
) {
  assertCan(ctx, "folio.post");
  const input = closeShiftSchema.parse(raw);
  const rid = ctx.restaurant.id;
  if (input.handedToUserId) {
    const [m] = await db
      .select({ id: restaurantMembers.userId })
      .from(restaurantMembers)
      .where(
        and(eq(restaurantMembers.restaurantId, rid), eq(restaurantMembers.userId, input.handedToUserId)),
      );
    if (!m || input.handedToUserId === ctx.user.id)
      throw validation("invalid_recipient", { field: "handedToUserId" });
  }
  return db.transaction(async (tx) => {
    const [s] = await tx
      .select()
      .from(deskShifts)
      .where(
        and(
          eq(deskShifts.restaurantId, rid),
          eq(deskShifts.userId, ctx.user.id),
          isNull(deskShifts.closedAt),
        ),
      )
      .for("update");
    if (!s) throw notFound("no_open_shift");
    const now = new Date();
    const t = await takingsOf(tx, rid, ctx.user.id, s.openedAt, now);
    const [closed] = await tx
      .update(deskShifts)
      .set({
        closedAt: now,
        expected: t.byMethod,
        expectedForeign: t.foreign,
        countedCashCents: input.countedCashCents,
        countedForeign: input.countedForeign,
        handedToUserId: input.handedToUserId,
        note: input.note,
      })
      .where(eq(deskShifts.id, s.id))
      .returning();
    const expectedCash = s.openingFloatCents + (t.byMethod.cash ?? 0);
    await recordAudit(tx, {
      action: "desk_shift.closed",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "desk_shift",
      entityId: s.id,
      metadata: {
        expectedCash,
        counted: input.countedCashCents,
        difference: input.countedCashCents - expectedCash,
        handedTo: input.handedToUserId,
      },
    });
    return {
      ...closed!,
      expectedCashCents: expectedCash,
      differenceCents: input.countedCashCents - expectedCash,
    };
  });
}

/** گزارش تحویل صندوق: the shifts closed in the period, expected against counted. */
export async function shiftReport(
  db: DbOrTx,
  ctx: RestaurantContext,
  p: { from: string; to: string },
): Promise<Table> {
  assertCan(ctx, "folio.post");
  const all = ctx.permissions.has("folio.adjust") || ctx.permissions.has("accounting.manage");
  const tz = ctx.restaurant.timezone;
  const handedTo = sql<
    string | null
  >`(select u2.full_name from users u2 where u2.id = ${deskShifts.handedToUserId})`;
  const rows = await db
    .select({
      s: deskShifts,
      user: users.fullName,
      handedTo,
    })
    .from(deskShifts)
    .leftJoin(users, eq(users.id, deskShifts.userId))
    .where(
      and(
        eq(deskShifts.restaurantId, ctx.restaurant.id),
        isNotNull(deskShifts.closedAt),
        sql`(${deskShifts.closedAt} at time zone ${tz})::date between ${p.from}::date and ${p.to}::date`,
        all ? undefined : eq(deskShifts.userId, ctx.user.id),
      ),
    )
    .orderBy(desc(deskShifts.closedAt))
    .limit(1000);
  const out = rows.map(({ s, user, handedTo: to }) => {
    const e = s.expected ?? {};
    const expectedCash = s.openingFloatCents + (e.cash ?? 0);
    const other = Object.entries(e)
      .filter(([k]) => k !== "cash")
      .reduce((n, [, v]) => n + v, 0);
    const foreign = Object.entries(s.countedForeign ?? {})
      .filter(([, v]) => v > 0)
      .map(([c, v]) => `${(v / 100).toLocaleString("en")} ${c}`)
      .join(" · ");
    return {
      user: user ?? "—",
      opened: s.openedAt.toISOString(),
      closed: s.closedAt ? s.closedAt.toISOString() : "",
      float: s.openingFloatCents,
      cash: e.cash ?? 0,
      expected: expectedCash,
      counted: s.countedCashCents ?? 0,
      difference: (s.countedCashCents ?? 0) - expectedCash,
      other,
      foreign,
      handedTo: to ?? "",
      note: s.note ?? "",
    };
  });
  const sum = (k: keyof (typeof out)[number]) => out.reduce((n, r) => n + Number(r[k] ?? 0), 0);
  return {
    cols: [
      { key: "user", type: "text" },
      { key: "opened", type: "datetime" },
      { key: "closed", type: "datetime" },
      { key: "float", type: "money" },
      { key: "cash", type: "money" },
      { key: "expected", type: "money" },
      { key: "counted", type: "money" },
      { key: "difference", type: "money" },
      { key: "other", type: "money" },
      { key: "foreign", type: "text" },
      { key: "handedTo", type: "text" },
      { key: "note", type: "text" },
    ],
    rows: out,
    totals: {
      user: "total",
      cash: sum("cash"),
      expected: sum("expected"),
      counted: sum("counted"),
      difference: sum("difference"),
      other: sum("other"),
    },
  };
}

/** The colleagues a drawer can be handed to. */
export async function deskColleagues(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "folio.post");
  return db
    .select({ id: users.id, name: users.fullName })
    .from(restaurantMembers)
    .innerJoin(users, eq(users.id, restaurantMembers.userId))
    .where(eq(restaurantMembers.restaurantId, ctx.restaurant.id))
    .orderBy(users.fullName);
}

/**
 * Open folios matching a search (booking or folio number, room, guest or company name), with their
 * lines: where the cashier moves postings from (جابجایی حساب) or transfers a balance (انتقال حساب).
 */
export async function searchFolios(db: DbOrTx, ctx: RestaurantContext, raw: string) {
  assertCan(ctx, "folio.post");
  const q = raw.trim().replace(/[%_]/g, "").slice(0, 60);
  if (q.length < 1) return [];
  const digits = q.replace(/[^\d]/g, "");
  const like = `%${q}%`;
  const name = sql<string>`trim(concat_ws(' ', ${hotelGuests.firstName}, ${hotelGuests.lastName}))`;
  const found = await db
    .select({ id: folios.id, room: diningTables.label, stay: stays.number, stayStatus: stays.status })
    .from(folios)
    .leftJoin(stays, eq(stays.id, folios.stayId))
    .leftJoin(hotelGuests, eq(hotelGuests.id, sql`coalesce(${folios.guestId}, ${stays.guestId})`))
    .leftJoin(hotelAccounts, eq(hotelAccounts.id, folios.accountId))
    .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
    .where(
      and(
        eq(folios.restaurantId, ctx.restaurant.id),
        eq(folios.status, "open"),
        sql`(${name} ilike ${like} or ${hotelAccounts.name} ilike ${like} or ${diningTables.label} = ${q}
          or ${folios.label} ilike ${like}
          ${digits ? sql`or ${stays.number}::text = ${digits} or ${folios.number}::text = ${digits}` : sql``})`,
      ),
    )
    .orderBy(desc(folios.createdAt))
    .limit(8);
  return Promise.all(
    found.map(async (f) => {
      const v = await folioView(db, ctx.restaurant.id, f.id);
      return {
        id: v.id,
        number: v.number,
        holder: v.accountName ?? (`${v.guestFirst ?? ""} ${v.guestLast ?? ""}`.trim() || v.label || ""),
        room: f.room,
        stay: f.stay,
        stayStatus: f.stayStatus,
        account: !!v.accountId,
        balanceCents: v.balanceCents,
        lines: v.lines
          .filter((l) => !l.voidedAt)
          .map((l) => ({
            id: l.id,
            businessDate: l.businessDate,
            kind: l.kind,
            department: l.department,
            description: l.description,
            method: l.method,
            amountCents: l.amountCents,
            quantity: l.quantity,
          })),
      };
    }),
  );
}
