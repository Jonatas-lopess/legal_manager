// `audit_log.action` is a real Postgres enum (`audit_action`, see
// packages/db/src/schema.ts's `auditActionEnum`) — safe to type narrowly.
export const auditActions = ["insert", "update", "delete"] as const;
export type AuditAction = (typeof auditActions)[number];

// `audit_log.entity` is plain `text` (the trigger writes `tg_table_name`),
// not a Postgres enum — these are just the tables the trigger is currently
// attached to (postgres-schema-rls's 04-payments-audit-log.md), kept here
// for the filter dropdown's options and the tab's PT label map. A future
// audited table would still round-trip fine (querying/listing an unlisted
// `entity` value works), just without a nice label — same "don't type
// stronger than the schema actually guarantees" caution as elsewhere in this
// codebase (e.g. matters.repository.ts's `ListMattersParams.status` staying
// a plain `string`).
export const auditEntities = ["clients", "matters", "payments"] as const;
export type AuditEntity = (typeof auditEntities)[number];

export interface AuditActor {
  id: string;
  name: string | null;
  email: string | null;
}

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  createdAt: string;
  /** `null` when `audit_log.user_id` is null — either a non-authenticated
   * write (a migration/test fixture, a future service-role write) or a write
   * whose acting user has since been removed (`ON DELETE SET NULL`). */
  actor: AuditActor | null;
}

export interface ListAuditLogFilter {
  entity?: string;
  action?: AuditAction;
  /** Inclusive local calendar date (`YYYY-MM-DD`), same shape as every other
   * date-range filter in this codebase (e.g. reports.repository.ts's
   * `PeriodoRange`). */
  dateFrom?: string;
  /** Inclusive local calendar date (`YYYY-MM-DD`) — see `dateFrom`. */
  dateTo?: string;
}
