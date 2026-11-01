import { describe, expect, it } from "vitest";
import { canAssignRole, PERMISSIONS, resolvePermissions } from "@/server/auth/permissions";

describe("permissions", () => {
  it("owners have every permission and cannot be restricted", () => {
    const p = resolvePermissions("owner", [], ["menu.manage", "members.manage"]);
    expect(p.size).toBe(PERMISSIONS.length);
    expect(p.has("menu.manage")).toBe(true);
  });

  it("staff defaults are limited to service operations", () => {
    const p = resolvePermissions("staff");
    expect(p.has("orders.update_status")).toBe(true);
    expect(p.has("menu.manage")).toBe(false);
    expect(p.has("members.manage")).toBe(false);
    expect(p.has("payments.refund")).toBe(false);
  });

  it("applies granted and revoked permissions, ignoring unknown ones", () => {
    const p = resolvePermissions("staff", ["menu.manage", "hack.everything"], ["payments.record"]);
    expect(p.has("menu.manage")).toBe(true);
    expect(p.has("payments.record")).toBe(false);
    expect([...p].every((x) => (PERMISSIONS as readonly string[]).includes(x))).toBe(true);
  });

  it("role assignment rules", () => {
    expect(canAssignRole("owner", "admin")).toBe(true);
    expect(canAssignRole("owner", "owner")).toBe(false);
    expect(canAssignRole("admin", "staff")).toBe(true);
    expect(canAssignRole("admin", "admin")).toBe(false);
    expect(canAssignRole("staff", "staff")).toBe(false);
  });
});
