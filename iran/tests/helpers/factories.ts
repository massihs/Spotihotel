import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { registerOwner } from "@/server/modules/auth/service";
import { hashPassword } from "@/server/auth/password";
import { plans, restaurantMembers, subscriptions, users } from "@/server/db/schema";
import type { SessionUser } from "@/server/auth/sessions";
import { loadRestaurantContext } from "@/server/tenancy";

export const uniqueEmail = (prefix = "user") => `${prefix}-${randomUUID().slice(0, 8)}@test.local`;
export const TEST_PASSWORD = "CorrectHorse42!";

/** New owner + organization + restaurant (Free plan unless `plan` is given) and its owner context. */
export async function createOwnerWithRestaurant(name = "Le Test", opts: { plan?: string } = {}) {
  const email = uniqueEmail("owner");
  const res = await registerOwner(db, {
    email,
    password: TEST_PASSWORD,
    fullName: "Owner Test",
    restaurantName: name,
  });
  if (opts.plan) await setPlan(res.organization.id, opts.plan);
  const sessionUser = toSessionUser(res.user);
  const ctx = await loadRestaurantContext(db, sessionUser, res.restaurant.id);
  return { ...res, sessionUser, ctx };
}

export async function setPlan(organizationId: string, code: string) {
  const [plan] = await db.select().from(plans).where(eq(plans.code, code));
  await db
    .update(subscriptions)
    .set({ planId: plan!.id })
    .where(eq(subscriptions.organizationId, organizationId));
}

export function contextFor(user: SessionUser, restaurantId: string) {
  return loadRestaurantContext(db, user, restaurantId);
}

export async function createUser(opts: { superAdmin?: boolean } = {}) {
  const [u] = await db
    .insert(users)
    .values({
      email: uniqueEmail(opts.superAdmin ? "admin" : "user"),
      passwordHash: await hashPassword(TEST_PASSWORD),
      fullName: "Test User",
      isSuperAdmin: opts.superAdmin ?? false,
    })
    .returning();
  return { user: u!, sessionUser: toSessionUser(u!) };
}

export async function addMember(
  restaurantId: string,
  userId: string,
  role: "admin" | "staff",
  extra: { granted?: string[]; revoked?: string[]; status?: "active" | "disabled" } = {},
) {
  await db.insert(restaurantMembers).values({
    restaurantId,
    userId,
    role,
    grantedPermissions: extra.granted ?? [],
    revokedPermissions: extra.revoked ?? [],
    status: extra.status ?? "active",
  });
}

export function toSessionUser(u: {
  id: string;
  email: string;
  fullName: string;
  locale: string | null;
  isSuperAdmin: boolean;
}): SessionUser {
  return { id: u.id, email: u.email, fullName: u.fullName, locale: u.locale, isSuperAdmin: u.isSuperAdmin };
}
