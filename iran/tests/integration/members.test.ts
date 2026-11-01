import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { authenticate } from "@/server/modules/auth/service";
import { createAuthSession, validateAuthSession } from "@/server/auth/sessions";
import {
  addMember as addMemberService,
  listMembers,
  removeMember,
  updateMember,
} from "@/server/modules/members/service";
import {
  contextFor,
  createOwnerWithRestaurant,
  createUser,
  TEST_PASSWORD,
  uniqueEmail,
} from "../helpers/factories";

const NEW_PASSWORD = "StaffPassword123";

describe("team members", () => {
  it("creates an account for a new staff member who can then sign in", async () => {
    const { ctx } = await createOwnerWithRestaurant("Team", { plan: "professional" });
    const email = uniqueEmail("staff");
    const res = await addMemberService(db, ctx, {
      email,
      fullName: "Léa Staff",
      role: "staff",
      password: NEW_PASSWORD,
    });
    expect(res.accountCreated).toBe(true);
    expect((await authenticate(db, { email, password: NEW_PASSWORD }))?.email).toBe(email);
    const list = await listMembers(db, ctx);
    expect(list.map((m) => m.role)).toEqual(["owner", "staff"]);
  });

  it("links an existing account without touching its password", async () => {
    const { ctx } = await createOwnerWithRestaurant("Team", { plan: "professional" });
    const other = await createUser();
    const res = await addMemberService(db, ctx, {
      email: other.user.email.toUpperCase(),
      role: "admin",
      password: "Whatever12345",
    });
    expect(res.accountCreated).toBe(false);
    expect(await authenticate(db, { email: other.user.email, password: TEST_PASSWORD })).not.toBeNull();
    await expect(
      addMemberService(db, ctx, { email: other.user.email, fullName: "X", role: "staff" }),
    ).rejects.toMatchObject({ message: "already_member" });
  });

  it("requires a password for brand-new accounts", async () => {
    const { ctx } = await createOwnerWithRestaurant("Team", { plan: "professional" });
    await expect(
      addMemberService(db, ctx, { email: uniqueEmail(), fullName: "No Pass", role: "staff" }),
    ).rejects.toMatchObject({ message: "password_required" });
  });

  it("applies role hierarchy: admins manage staff only, owners are protected", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant("Team", { plan: "professional" });
    const adminUser = await createUser();
    const { member: adminMember } = await addMemberService(db, ctx, {
      email: adminUser.user.email,
      fullName: "A",
      role: "admin",
    });
    const actx = await contextFor(adminUser.sessionUser, restaurant.id);

    await expect(
      addMemberService(db, actx, {
        email: uniqueEmail(),
        fullName: "B",
        role: "admin",
        password: NEW_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const { member: staffMember } = await addMemberService(db, actx, {
      email: uniqueEmail(),
      fullName: "S",
      role: "staff",
      password: NEW_PASSWORD,
    });

    const owner = (await listMembers(db, ctx)).find((m) => m.role === "owner")!;
    const patch = {
      role: "staff" as const,
      grantedPermissions: [],
      revokedPermissions: [],
      status: "active" as const,
    };
    await expect(updateMember(db, actx, owner.id, patch)).rejects.toMatchObject({
      message: "owner_protected",
    });
    await expect(updateMember(db, actx, adminMember.id, patch)).rejects.toMatchObject({
      message: "cannot_edit_self",
    });
    await expect(updateMember(db, actx, staffMember.id, { ...patch, role: "admin" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(updateMember(db, actx, staffMember.id, patch)).resolves.toBeTruthy();
  });

  it("stores only permission deltas and never grants more than the actor has", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant("Team", { plan: "professional" });
    const s = await createUser();
    const { member } = await addMemberService(db, ctx, { email: s.user.email, fullName: "S", role: "staff" });
    const updated = await updateMember(db, ctx, member.id, {
      role: "staff",
      grantedPermissions: ["menu.manage", "orders.view"], // orders.view is already a staff default
      revokedPermissions: ["payments.record", "menu.manage"],
      status: "active",
    });
    expect(updated.grantedPermissions).toEqual(["menu.manage"]);
    expect(updated.revokedPermissions).toEqual(["payments.record"]);
    const sctx = await contextFor(s.sessionUser, restaurant.id);
    expect(sctx.permissions.has("menu.manage")).toBe(true);
    expect(sctx.permissions.has("payments.record")).toBe(false);
  });

  it("disabling or removing a member cuts access immediately", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant("Team", { plan: "professional" });
    const s = await createUser();
    const { member } = await addMemberService(db, ctx, { email: s.user.email, fullName: "S", role: "staff" });
    const { token } = await createAuthSession(db, s.user.id);

    await updateMember(db, ctx, member.id, {
      role: "staff",
      grantedPermissions: [],
      revokedPermissions: [],
      status: "disabled",
    });
    await expect(contextFor(s.sessionUser, restaurant.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await removeMember(db, ctx, member.id);
    expect(await validateAuthSession(db, token)).toBeNull();
    const [u] = await db.select().from(users).where(eq(users.id, s.user.id));
    expect(u).toBeTruthy(); // the account itself is kept
  });

  it("enforces the staff quota of the plan", async () => {
    const { ctx } = await createOwnerWithRestaurant("Free team"); // Free = 2 members incl. owner
    await addMemberService(db, ctx, {
      email: uniqueEmail(),
      fullName: "One",
      role: "staff",
      password: NEW_PASSWORD,
    });
    await expect(
      addMemberService(db, ctx, {
        email: uniqueEmail(),
        fullName: "Two",
        role: "staff",
        password: NEW_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "PLAN_LIMIT" });
  });

  it("cannot touch members of another restaurant", async () => {
    const a = await createOwnerWithRestaurant("A", { plan: "professional" });
    const b = await createOwnerWithRestaurant("B", { plan: "professional" });
    const s = await createUser();
    const { member } = await addMemberService(db, b.ctx, {
      email: s.user.email,
      fullName: "S",
      role: "staff",
    });
    await expect(removeMember(db, a.ctx, member.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
