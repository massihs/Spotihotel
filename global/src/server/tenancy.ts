import { and, eq, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { restaurantMembers, restaurants } from "@/server/db/schema";
import { resolvePermissions, type MemberRole, type Permission } from "@/server/auth/permissions";
import type { SessionUser } from "@/server/auth/sessions";
import { AppError, forbidden, notFound } from "@/server/errors";
import { isUuid } from "@/lib/ids";

export type RestaurantSummary = {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  status: "active" | "suspended";
  currency: string;
  timezone: string;
  defaultLocale: string;
};

/**
 * Authenticated context for every tenant-scoped operation.
 * Services must take `restaurantId` from here — never from request input.
 */
export type RestaurantContext = {
  user: SessionUser;
  restaurant: RestaurantSummary;
  role: MemberRole;
  permissions: ReadonlySet<Permission>;
  /** True when a super admin accesses a restaurant they are not a member of. */
  viaSuperAdmin: boolean;
};

const restaurantColumns = {
  id: restaurants.id,
  organizationId: restaurants.organizationId,
  slug: restaurants.slug,
  name: restaurants.name,
  status: restaurants.status,
  currency: restaurants.currency,
  timezone: restaurants.timezone,
  defaultLocale: restaurants.defaultLocale,
};

export async function loadRestaurantContext(
  db: DbOrTx,
  user: SessionUser,
  restaurantId: string,
): Promise<RestaurantContext> {
  // Same error for "does not exist" and "not yours": never leak other tenants' ids.
  if (!isUuid(restaurantId)) throw notFound("Restaurant not found");

  const [row] = await db
    .select({
      restaurant: restaurantColumns,
      member: {
        role: restaurantMembers.role,
        status: restaurantMembers.status,
        granted: restaurantMembers.grantedPermissions,
        revoked: restaurantMembers.revokedPermissions,
      },
    })
    .from(restaurants)
    .leftJoin(
      restaurantMembers,
      and(eq(restaurantMembers.restaurantId, restaurants.id), eq(restaurantMembers.userId, user.id)),
    )
    .where(and(eq(restaurants.id, restaurantId), isNull(restaurants.deletedAt)))
    .limit(1);

  if (!row) throw notFound("Restaurant not found");

  const activeMember = row.member && row.member.status === "active" ? row.member : null;

  if (!activeMember) {
    if (!user.isSuperAdmin) throw notFound("Restaurant not found");
    return {
      user,
      restaurant: row.restaurant,
      role: "owner",
      permissions: resolvePermissions("owner"),
      viaSuperAdmin: true,
    };
  }

  if (row.restaurant.status === "suspended" && !user.isSuperAdmin) {
    throw new AppError("TENANT_SUSPENDED", "This restaurant is suspended");
  }

  return {
    user,
    restaurant: row.restaurant,
    role: activeMember.role,
    permissions: resolvePermissions(activeMember.role, activeMember.granted, activeMember.revoked),
    viaSuperAdmin: false,
  };
}

export function can(ctx: RestaurantContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

export function assertCan(ctx: RestaurantContext, permission: Permission): void {
  if (!ctx.permissions.has(permission)) throw forbidden(`Missing permission: ${permission}`);
}

export function assertSuperAdmin(user: SessionUser): void {
  if (!user.isSuperAdmin) throw forbidden("Super admin only");
}

export async function listUserRestaurants(db: DbOrTx, userId: string) {
  return db
    .select({ ...restaurantColumns, role: restaurantMembers.role })
    .from(restaurantMembers)
    .innerJoin(restaurants, eq(restaurants.id, restaurantMembers.restaurantId))
    .where(
      and(
        eq(restaurantMembers.userId, userId),
        eq(restaurantMembers.status, "active"),
        isNull(restaurants.deletedAt),
      ),
    )
    .orderBy(restaurants.name);
}
