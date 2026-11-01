import { eq, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/server/auth/password";
import { recordAudit } from "@/server/audit";
import { conflict } from "@/server/errors";
import { isUniqueViolation } from "@/server/db/errors";
import { createOrganization, createRestaurant } from "@/server/modules/restaurants/service";
import type { LoginInput, SignupInput } from "./schemas";

export async function findUserByEmail(db: Database, email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return user ?? null;
}

/** Self-service signup: creates user + organization + first restaurant (owner). */
export async function registerOwner(db: Database, input: SignupInput, meta: { ip?: string | null } = {}) {
  const passwordHash = await hashPassword(input.password);

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${input.email}`)
        .limit(1);
      if (existing) throw conflict("email_taken");

      const [user] = await tx
        .insert(users)
        .values({ email: input.email, passwordHash, fullName: input.fullName })
        .returning();

      const org = await createOrganization(tx, {
        name: input.restaurantName,
        ownerUserId: user!.id,
        billingEmail: input.email,
      });
      const restaurant = await createRestaurant(tx, {
        organizationId: org.id,
        ownerUserId: user!.id,
        name: input.restaurantName,
      });

      await recordAudit(tx, {
        action: "auth.signup",
        actorUserId: user!.id,
        restaurantId: restaurant.id,
        entityType: "restaurant",
        entityId: restaurant.id,
        ip: meta.ip,
      });

      return { user: user!, organization: org, restaurant };
    });
  } catch (e) {
    // Concurrent signups with the same email: the unique index is the source of truth.
    if (isUniqueViolation(e, "users_email_lower_uq")) throw conflict("email_taken");
    throw e;
  }
}

/** Returns the user when credentials are valid. Same timing & answer for unknown email or bad password. */
export async function authenticate(db: Database, input: LoginInput) {
  const user = await findUserByEmail(db, input.email);
  if (!user || user.deletedAt) {
    await burnPasswordCheck(input.password);
    return null;
  }
  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok || user.status !== "active") return null;
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return user;
}
