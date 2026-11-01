import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  kitchenStations,
  notifications,
  orderItems,
  restaurantMembers,
  restaurantSettings,
  restaurants,
  teamSections,
  type GuestCallOption,
} from "@/server/db/schema";
import { PERMISSIONS, type Permission } from "@/server/auth/permissions";
import { recordAudit } from "@/server/audit";
import { emit, topics } from "@/server/infra/realtime";
import { forbidden, notFound, validation } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";

/** What a section can be notified of (the notification types each covers). */
export const NOTIFY_OPTIONS = {
  orders: ["order.created"],
  ready: ["order.ready"],
  calls: ["waiter.call"],
  payments: ["payment.received", "payment.requested", "payment.needs_review"],
  reservations: ["reservation.created", "reservation.cancelled"],
  feedback: ["feedback.unhappy"],
  stock: ["stock.low"],
  goals: ["kpi.prep_slow", "kpi.rating_low", "kpi.revenue_missed"],
} as const;
export type NotifyOption = keyof typeof NOTIFY_OPTIONS;
export const NOTIFY_KEYS = Object.keys(NOTIFY_OPTIONS) as NotifyOption[];
/** Options whose notifications follow an order: a section tied to stations only gets its own. */
const ORDER_OPTIONS: readonly NotifyOption[] = ["orders", "ready"];

export const SECTION_COLORS = [
  "orange",
  "rose",
  "sky",
  "emerald",
  "amber",
  "violet",
  "teal",
  "fuchsia",
] as const;

const optionOf = (type: string) =>
  NOTIFY_KEYS.find((k) => (NOTIFY_OPTIONS[k] as readonly string[]).includes(type)) ?? null;

export type Route = {
  /** The order the notification is about: its lines' stations decide which sections it concerns. */
  orderId?: string;
  /** Send to this one section only (a bell option routed by the owner). */
  sectionId?: string | null;
};

/**
 * Sections a notification goes to. null = everyone (the restaurant has no sections, or the type
 * is not one sections choose); otherwise only the sections that asked for it, which may be none
 * (then only the owner and members without a section see it).
 */
export async function sectionsFor(
  db: DbOrTx,
  restaurantId: string,
  type: string,
  route: Route = {},
): Promise<string[] | null> {
  const rows = await db
    .select({ id: teamSections.id, notify: teamSections.notify, stationIds: teamSections.stationIds })
    .from(teamSections)
    .where(eq(teamSections.restaurantId, restaurantId));
  if (!rows.length) return null;
  if (route.sectionId && rows.some((r) => r.id === route.sectionId)) return [route.sectionId];
  const option = optionOf(type);
  if (!option) return null;
  let stations: string[] | null = null;
  if (route.orderId && ORDER_OPTIONS.includes(option)) {
    const lines = await db
      .selectDistinct({ stationId: orderItems.stationId })
      .from(orderItems)
      .where(eq(orderItems.orderId, route.orderId));
    stations = lines.map((l) => l.stationId).filter((s): s is string => s != null);
  }
  return rows
    .filter(
      (r) =>
        r.notify.includes(option) &&
        (!ORDER_OPTIONS.includes(option) ||
          !r.stationIds.length ||
          stations == null ||
          stations.some((s) => r.stationIds.includes(s))),
    )
    .map((r) => r.id);
}

/**
 * Records a team notification for the sections it concerns and rings the dashboards.
 * Returns the sections (null = everyone) so live events can carry them.
 */
export async function notifyTeam(
  db: DbOrTx,
  n: { restaurantId: string; type: string; payload: Record<string, unknown>; createdAt?: Date },
  route: Route = {},
) {
  const sectionIds = await sectionsFor(db, n.restaurantId, n.type, route);
  await db.insert(notifications).values({ ...n, sectionIds });
  await emit(db, {
    topic: topics.restaurant(n.restaurantId),
    type: "notification.created",
    data: { sections: sectionIds },
  });
  return sectionIds;
}

/** Whether a member (their sections; null = sees everything) is concerned by a notification. */
export const concerns = (mine: readonly string[] | null, target: unknown) =>
  mine == null || !Array.isArray(target) || target.some((s) => mine.includes(s as string));

/** The sections a member's notifications are filtered by (null = sees everything). */
export const sectionFilterOf = (ctx: RestaurantContext) =>
  ctx.role === "owner" || !ctx.sectionIds?.length ? null : ctx.sectionIds;

// ---------------------------------------------------------------------------------------------
// Sections (Team page)

export const sectionSchema = z.object({
  name: z.string().trim().min(1).max(48),
  color: z.enum(SECTION_COLORS),
  /** null = members keep their own role's permissions. */
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).nullable(),
  notify: z.array(z.enum(NOTIFY_KEYS as [NotifyOption, ...NotifyOption[]])).max(NOTIFY_KEYS.length),
  stationIds: z.array(z.uuid()).max(20),
});
export type SectionInput = z.input<typeof sectionSchema>;

export async function listSections(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "members.manage");
  return db
    .select()
    .from(teamSections)
    .where(eq(teamSections.restaurantId, ctx.restaurant.id))
    .orderBy(asc(teamSections.position), asc(teamSections.createdAt));
}

async function checkedStations(tx: DbOrTx, ctx: RestaurantContext, ids: string[]) {
  if (!ids.length) return [];
  const rows = await tx
    .select({ id: kitchenStations.id })
    .from(kitchenStations)
    .where(and(eq(kitchenStations.restaurantId, ctx.restaurant.id), inArray(kitchenStations.id, ids)));
  return rows.map((r) => r.id);
}

/** Creates (id null) or edits a section. Nobody can give a section more than they have. */
export async function saveSection(
  db: Database,
  ctx: RestaurantContext,
  id: string | null,
  raw: SectionInput,
) {
  assertCan(ctx, "members.manage");
  const input = sectionSchema.parse(raw);
  const permissions = input.permissions
    ? [...new Set<Permission>(["restaurant.view", ...input.permissions])].filter((p) =>
        ctx.permissions.has(p),
      )
    : null;
  return db.transaction(async (tx) => {
    const values = {
      name: input.name,
      color: input.color,
      permissions,
      notify: [...new Set(input.notify)],
      stationIds: await checkedStations(tx, ctx, [...new Set(input.stationIds)]),
    };
    let row;
    if (id) {
      if (!isUuid(id)) throw notFound();
      [row] = await tx
        .update(teamSections)
        .set(values)
        .where(and(eq(teamSections.id, id), eq(teamSections.restaurantId, ctx.restaurant.id)))
        .returning();
      if (!row) throw notFound();
    } else {
      const [{ n }] = (await tx
        .select({ n: sql<number>`count(*)`.mapWith(Number) })
        .from(teamSections)
        .where(eq(teamSections.restaurantId, ctx.restaurant.id))) as [{ n: number }];
      if (n >= 30) throw validation("too_many_sections");
      [row] = await tx
        .insert(teamSections)
        .values({ ...values, restaurantId: ctx.restaurant.id, position: n })
        .returning();
    }
    await recordAudit(tx, {
      action: id ? "section.updated" : "section.created",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "team_section",
      entityId: row!.id,
      metadata: { name: values.name, permissions, notify: values.notify },
    });
    return row!;
  });
}

export async function deleteSection(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "members.manage");
  if (!isUuid(id)) throw notFound();
  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(teamSections)
      .where(and(eq(teamSections.id, id), eq(teamSections.restaurantId, ctx.restaurant.id)))
      .returning({ id: teamSections.id, name: teamSections.name });
    if (!row) throw notFound();
    await tx
      .update(restaurantMembers)
      .set({ sectionIds: sql`array_remove(${restaurantMembers.sectionIds}, ${id}::uuid)` })
      .where(eq(restaurantMembers.restaurantId, ctx.restaurant.id));
    await recordAudit(tx, {
      action: "section.deleted",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "team_section",
      entityId: id,
      metadata: { name: row.name },
    });
  });
}

/** Puts a member in sections (none = back to their role's access and every notification). */
export async function setMemberSections(
  db: Database,
  ctx: RestaurantContext,
  memberId: string,
  sectionIds: string[],
) {
  assertCan(ctx, "members.manage");
  const ids = z
    .array(z.uuid())
    .max(30)
    .parse([...new Set(sectionIds)]);
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select({ id: restaurantMembers.id, role: restaurantMembers.role, userId: restaurantMembers.userId })
      .from(restaurantMembers)
      .where(and(eq(restaurantMembers.id, memberId), eq(restaurantMembers.restaurantId, ctx.restaurant.id)));
    if (!m) throw notFound();
    if (m.role === "owner" && m.userId !== ctx.user.id) throw forbidden("owner_protected");
    if (m.role === "admin" && ctx.role !== "owner") throw forbidden("role_not_assignable");
    const valid = ids.length
      ? (
          await tx
            .select({ id: teamSections.id })
            .from(teamSections)
            .where(and(eq(teamSections.restaurantId, ctx.restaurant.id), inArray(teamSections.id, ids)))
        ).map((r) => r.id)
      : [];
    await tx.update(restaurantMembers).set({ sectionIds: valid }).where(eq(restaurantMembers.id, m.id));
    await recordAudit(tx, {
      action: "member.updated",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "restaurant_member",
      entityId: m.id,
      metadata: { sections: valid },
    });
    return valid;
  });
}

// ---------------------------------------------------------------------------------------------
// Guest call bell (options shown on the menu)

/**
 * Hotel room services (only offered in a room): the first four are on by default, the others
 * wait for the hotel to switch them on.
 */
export const ROOM_CALLS = [
  "housekeeping",
  "towels",
  "reception",
  "laundry",
  "wakeup",
  "minibar",
  "maintenance",
  "luggage",
  "taxi",
] as const;
const ROOM_CALLS_ON = new Set(["housekeeping", "towels", "reception", "laundry"]);
export const BUILTIN_CALLS = ["waiter", "bill", "water", ...ROOM_CALLS] as const;
const isRoomCall = (key: string) => (ROOM_CALLS as readonly string[]).includes(key);
export const CALL_ICONS = [
  "hand",
  "receipt",
  "droplets",
  "flame",
  "wind",
  "utensils",
  "coffee",
  "baby",
  "sparkles",
  "bell",
  "shirt",
  "alarm",
  "wine",
  "wrench",
  "luggage",
  "car",
  "bed",
  "spray",
] as const;
const BUILTIN_ICON: Record<string, (typeof CALL_ICONS)[number]> = {
  waiter: "hand",
  bill: "receipt",
  water: "droplets",
  housekeeping: "sparkles",
  towels: "droplets",
  reception: "bell",
  laundry: "shirt",
  wakeup: "alarm",
  minibar: "wine",
  maintenance: "wrench",
  luggage: "luggage",
  taxi: "car",
};

export type GuestCall = { key: string; label: string | null; icon: string; sectionId: string | null };

/**
 * Every option (enabled or not), built-ins first if the restaurant never saved any. The room
 * options only exist for hotels, where they are on by default.
 */
export function normalizeCalls(
  saved: GuestCallOption[] | null | undefined,
  kind: string = "restaurant",
): GuestCallOption[] {
  const list = saved?.length ? saved : [];
  const hotel = kind === "hotel";
  const out = BUILTIN_CALLS.filter((key) => hotel || !isRoomCall(key)).map(
    (key) =>
      list.find((o) => o.key === key) ?? {
        key,
        enabled: !isRoomCall(key) || ROOM_CALLS_ON.has(key),
        sectionId: null,
      },
  ) as GuestCallOption[];
  const ordered = list.length ? list.filter((o) => o.key.startsWith("c-")) : [];
  return [...out, ...ordered].map((o) => ({
    ...o,
    icon: o.icon ?? BUILTIN_ICON[o.key] ?? "bell",
    sectionId: o.sectionId ?? null,
  }));
}

/** The options a guest sees on the bell (room options only in a hotel room). */
export async function guestCallsOf(
  db: DbOrTx,
  restaurantId: string,
  place: { room?: boolean } = {},
): Promise<GuestCall[]> {
  const [s] = await db
    .select({ calls: restaurantSettings.guestCalls, kind: restaurants.kind })
    .from(restaurants)
    .leftJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .where(eq(restaurants.id, restaurantId));
  return normalizeCalls(s?.calls, s?.kind)
    .filter((o) => o.enabled && (place.room || (!isRoomCall(o.key) && !o.roomOnly)))
    .map((o) => ({
      key: o.key,
      label: o.key.startsWith("c-") ? (o.label ?? "") : null,
      icon: o.icon ?? "bell",
      sectionId: o.sectionId ?? null,
    }));
}

export async function listGuestCalls(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "members.manage");
  const [s] = await db
    .select({ calls: restaurantSettings.guestCalls })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  return normalizeCalls(s?.calls, ctx.restaurant.kind);
}

const callSchema = z.object({
  key: z.union([z.enum(BUILTIN_CALLS), z.string().regex(/^c-[a-z0-9]{4,12}$/)]),
  label: z.string().trim().max(32).optional(),
  icon: z.enum(CALL_ICONS).optional(),
  sectionId: z.uuid().nullable().optional(),
  enabled: z.boolean(),
  roomOnly: z.boolean().optional(),
});
export const guestCallsSchema = z.array(callSchema).max(28);

export async function saveGuestCalls(db: Database, ctx: RestaurantContext, raw: unknown) {
  assertCan(ctx, "members.manage");
  const input = guestCallsSchema.parse(raw);
  const sectionIds = (
    await db
      .select({ id: teamSections.id })
      .from(teamSections)
      .where(eq(teamSections.restaurantId, ctx.restaurant.id))
  ).map((r) => r.id);
  const seen = new Set<string>();
  const calls: GuestCallOption[] = [];
  for (const c of input) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    const custom = c.key.startsWith("c-");
    if (custom && !c.label) throw validation("label_required", { field: c.key });
    calls.push({
      key: c.key,
      ...(custom ? { label: c.label } : {}),
      icon: c.icon,
      sectionId: c.sectionId && sectionIds.includes(c.sectionId) ? c.sectionId : null,
      enabled: c.enabled,
      ...(custom && c.roomOnly && ctx.restaurant.kind === "hotel" ? { roomOnly: true } : {}),
    });
  }
  await db
    .insert(restaurantSettings)
    .values({ restaurantId: ctx.restaurant.id, guestCalls: calls })
    .onConflictDoUpdate({ target: restaurantSettings.restaurantId, set: { guestCalls: calls } });
  return normalizeCalls(calls, ctx.restaurant.kind);
}
