/**
 * Fine-grained permissions. Checks are always done on permissions, never on role names,
 * so new roles (manager, kitchen, cashier...) can be introduced without refactoring.
 */
export const PERMISSIONS = [
  "restaurant.view",
  "restaurant.manage", // settings, legal info, payment configuration
  "members.manage",
  "tables.view",
  "tables.manage", // CRUD tables, QR codes
  "sessions.close",
  "menu.view",
  "menu.manage",
  "orders.view",
  "orders.update_status",
  "orders.cancel",
  "payments.view",
  "payments.record", // record cash / terminal payment
  "payments.refund",
  "invoices.view",
  "analytics.view",
  "feedback.view",
  "complaints.manage",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type MemberRole = "owner" | "admin" | "staff";

const ALL = new Set<Permission>(PERMISSIONS);

export const ROLE_PERMISSIONS: Record<MemberRole, ReadonlySet<Permission>> = {
  owner: ALL,
  admin: new Set(PERMISSIONS.filter((p) => p !== "audit.view")),
  staff: new Set<Permission>([
    "restaurant.view",
    "tables.view",
    "sessions.close",
    "menu.view",
    "orders.view",
    "orders.update_status",
    "payments.view",
    "payments.record",
    "feedback.view",
  ]),
};

export const isPermission = (v: string): v is Permission => ALL.has(v as Permission);

/** Effective permissions = role defaults + granted − revoked. Owners can never lose permissions. */
export function resolvePermissions(
  role: MemberRole,
  granted: readonly string[] = [],
  revoked: readonly string[] = [],
): Set<Permission> {
  const result = new Set(ROLE_PERMISSIONS[role]);
  if (role === "owner") return result;
  for (const p of granted) if (isPermission(p)) result.add(p);
  for (const p of revoked) if (isPermission(p)) result.delete(p);
  return result;
}

/** Which roles an actor may assign. Only owners can create admins; nobody creates owners here. */
export function canAssignRole(actorRole: MemberRole, target: MemberRole): boolean {
  if (target === "owner") return false;
  if (actorRole === "owner") return true;
  return actorRole === "admin" && target === "staff";
}
