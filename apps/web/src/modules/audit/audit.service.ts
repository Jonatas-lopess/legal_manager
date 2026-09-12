import type { AuditLogEntry, ListAuditLogFilter } from "./audit.schema";
import * as repo from "./audit.repository";
import type { AuditLogRow } from "./audit.repository";

function toAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    createdAt: row.created_at,
    actor: row.actor ? { id: row.actor.id, name: row.actor.name, email: row.actor.email } : null,
  };
}

/** RLS scopes this to the caller's own tenant — see audit.repository.ts.
 * Read-only, thin passthrough: `audit_log` has no client-reachable
 * insert/update/delete grant, only the DB trigger writes it. */
export async function listAuditLog(filter: ListAuditLogFilter = {}): Promise<AuditLogEntry[]> {
  const { data, error } = await repo.listAuditLog(filter);
  if (error) throw error;
  return (data ?? []).map(toAuditLogEntry);
}
