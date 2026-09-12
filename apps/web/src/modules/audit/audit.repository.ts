import { supabase } from "@/lib/supabase";
import type { AuditAction } from "./audit.schema";

interface AuditActorRow {
  id: string;
  name: string | null;
  email: string | null;
}

interface AuditLogRow {
  id: string;
  action: AuditAction;
  entity: string;
  entity_id: string;
  created_at: string;
  // PostgREST embedded resource across `audit_log.user_id -> users.id`
  // (the only FK from this table to `users`, so no `!user_id` embed hint is
  // needed to disambiguate it) — same conceptual join
  // tenants.repository.ts's `fetchTenantMembers` does for `name`/`email`,
  // just expressed as a nested select instead of querying `users` directly,
  // since here the base row (`audit_log`) is what's being listed. `user_id`
  // is nullable (`ON DELETE SET NULL`) — PostgREST embeds a nullable-FK
  // to-one relation as a left join, so a row whose acting user has since
  // been deleted still comes back with `actor: null` rather than being
  // dropped (verified by this module's own integration test, not just
  // assumed — see test/audit.service.test.ts's "null actor" case).
  actor: AuditActorRow | null;
}

const SELECT_COLUMNS = "id, action, entity, entity_id, created_at, actor:users(id, name, email)";

export interface ListAuditLogParams {
  entity?: string;
  action?: AuditAction;
  dateFrom?: string;
  dateTo?: string;
}

/** `dateFrom`/`dateTo` are plain `YYYY-MM-DD` local calendar dates, but
 * `audit_log.created_at` is a `timestamptz` compared as a UTC instant —
 * same "local midnight, not UTC midnight" correction
 * reports.repository.ts's `localDateStartUtcIso`/`exclusiveUpperBound`
 * already make, duplicated here rather than imported:
 * eslint-plugin-boundaries forbids importing another module's
 * `*.repository.ts` file, and every repository in this codebase already
 * keeps its own small filter helpers self-contained (e.g.
 * matters.repository.ts's `quoteFilterValue` comment). */
function localDateStartUtcIso(dateIso: string): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Date(year, month - 1, day).toISOString();
}

/** Exclusive upper bound for a `[from, to]` local-date range: the UTC
 * instant of local midnight on the day *after* `to`, so the query can use a
 * strict `<` and still include every event on the `to` day itself. */
function exclusiveUpperBound(dateIso: string): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Date(year, month - 1, day + 1).toISOString();
}

/**
 * RLS (`audit_log_select_own_tenant`) scopes this to the caller's own
 * tenant — no client-side `tenant_id` filter needed, matching every other
 * repository's existing convention in this codebase (e.g.
 * matters.repository.ts's `listMatters`, tenants.repository.ts's
 * `fetchTenantMembers`). Reverse-chronological, matching the tab's narrative-
 * line list.
 */
export async function listAuditLog({ entity, action, dateFrom, dateTo }: ListAuditLogParams) {
  let query = supabase.from("audit_log").select(SELECT_COLUMNS).order("created_at", { ascending: false });

  if (entity) query = query.eq("entity", entity);
  if (action) query = query.eq("action", action);
  if (dateFrom) query = query.gte("created_at", localDateStartUtcIso(dateFrom));
  if (dateTo) query = query.lt("created_at", exclusiveUpperBound(dateTo));

  return query.returns<AuditLogRow[]>();
}

export type { AuditLogRow };
