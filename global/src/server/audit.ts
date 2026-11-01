import type { DbOrTx } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";

export type AuditEntry = {
  action: string;
  actorUserId?: string | null;
  actorType?: "user" | "guest" | "system";
  restaurantId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
};

/** Append-only audit trail for security-relevant and business-critical actions. */
export async function recordAudit(db: DbOrTx, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    action: entry.action,
    actorUserId: entry.actorUserId ?? null,
    actorType: entry.actorType ?? (entry.actorUserId ? "user" : "system"),
    restaurantId: entry.restaurantId ?? null,
    entityType: entry.entityType,
    entityId: entry.entityId,
    metadata: entry.metadata ?? {},
    ip: entry.ip?.slice(0, 64) ?? null,
  });
}
