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
  "orders.create", // point of sale: counter / phone / takeaway orders
  "cash.manage", // open and close the cash drawer
  "payments.view",
  "payments.record", // record cash / terminal payment
  "payments.refund",
  "invoices.view",
  "inventory.view",
  "inventory.manage", // ingredients, recipes, purchases, suppliers
  "customers.view",
  "customers.manage", // loyalty, coupons, SMS campaigns
  "accounting.manage", // expenses and financial reports
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
    "orders.create",
    "cash.manage",
    "inventory.view",
    "customers.view",
    // Waiters hand out invoices (فاکتور) when a guest asks for one.
    "invoices.view",
    "feedback.view",
  ]),
};

export const isPermission = (v: string): v is Permission => ALL.has(v as Permission);

/**
 * Effective permissions = role defaults + granted − revoked. Owners can never lose permissions.
 * A staff member in team sections that set an access level gets exactly those sections' access.
 */
export function resolvePermissions(
  role: MemberRole,
  granted: readonly string[] = [],
  revoked: readonly string[] = [],
  sectionAccess: readonly (readonly string[])[] = [],
): Set<Permission> {
  if (role === "staff" && sectionAccess.length) {
    const fromSections = new Set<Permission>(["restaurant.view"]);
    for (const list of sectionAccess) for (const p of list) if (isPermission(p)) fromSections.add(p);
    return fromSections;
  }
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

/**
 * Permission preset of each job, as role + grants/revocations on top of the role defaults
 * (the owner can still fine-tune a member afterwards).
 */
export const JOB_PRESETS: Record<
  "manager" | "cashier" | "waiter" | "bar" | "kitchen",
  { role: Exclude<MemberRole, "owner">; granted: Permission[]; revoked: Permission[] }
> = {
  manager: { role: "admin", granted: [], revoked: [] },
  cashier: { role: "staff", granted: ["orders.cancel", "customers.manage"], revoked: [] },
  waiter: { role: "staff", granted: [], revoked: ["cash.manage", "inventory.view"] },
  bar: {
    role: "staff",
    granted: [],
    revoked: [
      "orders.create",
      "cash.manage",
      "payments.view",
      "payments.record",
      "invoices.view",
      "customers.view",
      "sessions.close",
      "tables.view",
    ],
  },
  kitchen: {
    role: "staff",
    granted: [],
    revoked: [
      "orders.create",
      "cash.manage",
      "payments.view",
      "payments.record",
      "invoices.view",
      "customers.view",
      "sessions.close",
      "tables.view",
    ],
  },
};
