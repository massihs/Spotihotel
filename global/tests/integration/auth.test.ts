import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import {
  auditLogs,
  authSessions,
  organizationMembers,
  restaurantMembers,
  restaurantSettings,
  subscriptions,
  taxRates,
  users,
} from "@/server/db/schema";
import { authenticate, registerOwner } from "@/server/modules/auth/service";
import { createAuthSession, revokeAuthSession, validateAuthSession } from "@/server/auth/sessions";
import { createOwnerWithRestaurant, TEST_PASSWORD, uniqueEmail } from "../helpers/factories";

describe("restaurant signup", () => {
  it("creates user, organization, restaurant, settings, taxes and owner membership", async () => {
    const { user, organization, restaurant } = await createOwnerWithRestaurant("Brasserie Élysée");

    expect(restaurant.slug).toMatch(/^brasserie-elysee/);
    expect(restaurant.organizationId).toBe(organization.id);
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);

    const [member] = await db
      .select()
      .from(restaurantMembers)
      .where(eq(restaurantMembers.restaurantId, restaurant.id));
    expect(member).toMatchObject({ userId: user.id, role: "owner", status: "active" });

    const [orgMember] = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organization.id));
    expect(orgMember?.role).toBe("owner");

    const [settings] = await db
      .select()
      .from(restaurantSettings)
      .where(eq(restaurantSettings.restaurantId, restaurant.id));
    expect(settings?.pricesIncludeTax).toBe(true);
    expect(settings?.orderPrefix).toBe("B");

    const rates = await db.select().from(taxRates).where(eq(taxRates.restaurantId, restaurant.id));
    expect(rates.map((r) => r.rateBps).sort()).toEqual([1000, 2000, 550].sort());
    expect(rates.filter((r) => r.isDefault)).toHaveLength(1);

    const audit = await db.select().from(auditLogs).where(eq(auditLogs.restaurantId, restaurant.id));
    expect(audit.some((a) => a.action === "auth.signup")).toBe(true);
  });

  it("generates unique slugs for homonym restaurants", async () => {
    const a = await createOwnerWithRestaurant("Chez Paul");
    const b = await createOwnerWithRestaurant("Chez Paul");
    expect(a.restaurant.slug).not.toBe(b.restaurant.slug);
  });

  it("rejects a duplicate email, case-insensitively, without partial writes", async () => {
    const email = uniqueEmail("dup");
    await registerOwner(db, { email, password: TEST_PASSWORD, fullName: "A", restaurantName: "R1" });
    const before = await db.select().from(users);
    await expect(
      registerOwner(db, {
        email: email.toUpperCase().toLowerCase(),
        password: TEST_PASSWORD,
        fullName: "B",
        restaurantName: "R2",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const after = await db.select().from(users);
    expect(after.length).toBe(before.length);
  });

  it("subscribes the organization to the free plan", async () => {
    const { organization } = await createOwnerWithRestaurant();
    const subs = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organization.id));
    expect(subs).toHaveLength(1);
    expect(subs[0]?.status).toBe("active");
  });
});

describe("authentication", () => {
  it("accepts valid credentials and rejects invalid ones identically", async () => {
    const { user } = await createOwnerWithRestaurant();
    expect((await authenticate(db, { email: user.email, password: TEST_PASSWORD }))?.id).toBe(user.id);
    expect(await authenticate(db, { email: user.email, password: "wrong-password" })).toBeNull();
    expect(await authenticate(db, { email: uniqueEmail("ghost"), password: TEST_PASSWORD })).toBeNull();
  });

  it("refuses disabled accounts", async () => {
    const { user } = await createOwnerWithRestaurant();
    await db.update(users).set({ status: "disabled" }).where(eq(users.id, user.id));
    expect(await authenticate(db, { email: user.email, password: TEST_PASSWORD })).toBeNull();
  });
});

describe("sessions", () => {
  it("validates a token, never stores it in clear, and revokes it", async () => {
    const { user } = await createOwnerWithRestaurant();
    const { token, sessionId } = await createAuthSession(db, user.id, { ip: "1.2.3.4" });

    const [row] = await db.select().from(authSessions).where(eq(authSessions.id, sessionId));
    expect(row?.tokenHash).not.toBe(token);

    const v = await validateAuthSession(db, token);
    expect(v?.user.id).toBe(user.id);
    expect(v?.user).not.toHaveProperty("passwordHash");

    await revokeAuthSession(db, sessionId);
    expect(await validateAuthSession(db, token)).toBeNull();
  });

  it("rejects expired sessions and garbage tokens", async () => {
    const { user } = await createOwnerWithRestaurant();
    const { token, sessionId } = await createAuthSession(db, user.id);
    await db
      .update(authSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authSessions.id, sessionId));
    expect(await validateAuthSession(db, token)).toBeNull();
    expect(await validateAuthSession(db, "short")).toBeNull();
    expect(await validateAuthSession(db, undefined)).toBeNull();
  });

  it("extends sessions close to expiry (sliding expiration)", async () => {
    const { user } = await createOwnerWithRestaurant();
    const { token, sessionId } = await createAuthSession(db, user.id);
    const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.update(authSessions).set({ expiresAt: soon }).where(eq(authSessions.id, sessionId));
    const v = await validateAuthSession(db, token);
    expect(v?.renewed).toBe(true);
    expect(v!.expiresAt.getTime()).toBeGreaterThan(soon.getTime());
  });

  it("kills sessions of disabled users", async () => {
    const { user } = await createOwnerWithRestaurant();
    const { token } = await createAuthSession(db, user.id);
    await db.update(users).set({ status: "disabled" }).where(eq(users.id, user.id));
    expect(await validateAuthSession(db, token)).toBeNull();
    const left = await db.select().from(authSessions).where(eq(authSessions.userId, user.id));
    expect(left).toHaveLength(0);
  });
});
