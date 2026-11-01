import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { customers, orders, restaurants } from "@/server/db/schema";
import { normalizeIranMobile } from "@/lib/phone";
import { validation } from "@/server/errors";
import { resolvePermissions } from "@/server/auth/permissions";
import { assertCan, listUserRestaurants, type RestaurantContext } from "@/server/tenancy";
import { listAddresses } from "@/server/modules/delivery/service";

/**
 * Call centre (Z-7): one operator answers for every branch of the group. A phone number shows
 * the caller's file in each branch (name, orders, addresses) and opens the till of the branch
 * that will cook, with the number prefilled.
 */
export async function callCenterBranches(db: Database, ctx: RestaurantContext) {
  assertCan(ctx, "orders.create");
  const orgId = ctx.restaurant.organizationId;
  // The platform admin sees the whole group; a member, the branches where they may ring up.
  const list = ctx.user.isSuperAdmin
    ? await db
        .select({ id: restaurants.id, name: restaurants.name })
        .from(restaurants)
        .where(
          and(
            eq(restaurants.organizationId, orgId),
            eq(restaurants.status, "active"),
            isNull(restaurants.deletedAt),
          ),
        )
        .orderBy(restaurants.name)
    : (await listUserRestaurants(db, ctx.user.id))
        .filter((r) => r.organizationId === orgId && r.status === "active")
        .filter((r) => resolvePermissions(r.role).has("orders.create"))
        .map((r) => ({ id: r.id, name: r.name }));
  if (!list.some((r) => r.id === ctx.restaurant.id))
    list.unshift({ id: ctx.restaurant.id, name: ctx.restaurant.name });
  return list;
}

export async function callCenterLookup(db: Database, ctx: RestaurantContext, rawPhone: string) {
  const phone = normalizeIranMobile(rawPhone);
  if (!phone) throw validation("invalid_phone", { field: "phone" });
  const branches = await callCenterBranches(db, ctx);
  if (branches.length === 0) return { phone, branches: [] };
  const ids = branches.map((b) => b.id);
  const [files, recent] = await Promise.all([
    db
      .select()
      .from(customers)
      .where(and(inArray(customers.restaurantId, ids), eq(customers.phone, phone))),
    db
      .select({
        id: orders.id,
        restaurantId: orders.restaurantId,
        number: orders.number,
        channel: orders.channel,
        status: orders.status,
        totalCents: orders.totalCents,
        currency: orders.currency,
        placedAt: orders.placedAt,
      })
      .from(orders)
      .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
      .where(
        and(
          inArray(orders.restaurantId, ids),
          eq(orders.customerPhone, phone),
          isNull(restaurants.deletedAt),
        ),
      )
      .orderBy(desc(orders.placedAt))
      .limit(30),
  ]);
  const out = [];
  for (const b of branches) {
    const file = files.find((f) => f.restaurantId === b.id) ?? null;
    out.push({
      ...b,
      customer: file
        ? {
            name: file.name,
            ordersCount: file.ordersCount,
            lastOrderAt: file.lastOrderAt,
            points: file.points,
            addresses: (await listAddresses(db, b.id, file.id)).slice(0, 3),
          }
        : null,
      orders: recent.filter((o) => o.restaurantId === b.id).slice(0, 5),
    });
  }
  // Branches that know the caller first.
  out.sort((a, b) => Number(Boolean(b.customer)) - Number(Boolean(a.customer)));
  return { phone, branches: out };
}
