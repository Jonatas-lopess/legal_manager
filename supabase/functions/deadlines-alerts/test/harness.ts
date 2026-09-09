import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client, Pool } from "pg";
import type { NotificationPayload } from "../repository.ts";

// Real local Supabase stack (`supabase start`) — same fixed local-dev demo
// values every other harness in this repo defaults to (see
// deadlines-holiday-sync/test/harness.ts, tenants/test/harness.ts). Override
// via env for CI/a differently-configured stack.
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:55321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

// Direct Postgres, connected as the migration-owning `postgres` role — same
// connection this function's own production repository.ts uses (see its
// module comment), so tests exercise the exact same grant/RLS-bypass path.
export const db = new Pool({ connectionString: DB_URL });

// `users.id` FKs to `auth.users.id` (packages/db's tenant-user-rls
// migration) — a fixture user needs a real GoTrue auth user, not just an
// arbitrary UUID, same reasoning as tenants/test/harness.ts's seedUser.
const authAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
}).auth.admin;

export async function assertStackReachable(): Promise<void> {
  const client = new Client({ connectionString: DB_URL });
  try {
    await client.connect();
    await client.query("select 1");
  } catch (error) {
    throw new Error(`Can't reach Postgres at ${DB_URL} — run \`supabase start\` for this project first.`, {
      cause: error,
    });
  } finally {
    await client.end().catch(() => {});
  }
}

const cleanupTenantIds: string[] = [];
const cleanupAuthUserIds: string[] = [];

export async function seedTenant(): Promise<string> {
  const { rows } = await db.query<{ id: string }>("insert into tenants (name) values ($1) returning id", [
    `Tenant ${randomUUID()}`,
  ]);
  const tenantId = rows[0]!.id;
  cleanupTenantIds.push(tenantId);
  return tenantId;
}

export interface SeededUser {
  id: string;
  tenantId: string;
  email: string;
}

/** No login ever happens in this suite (unlike tenants/test/harness.ts) —
 * these tests only assert against `notifications.recipient_user_id`/DB
 * state, they never authenticate as the fixture user, so no password is
 * tracked. */
export async function seedUser(tenantId: string, role: "admin" | "advogado" | "secretario" = "advogado"): Promise<SeededUser> {
  const suffix = randomUUID();
  const email = `${role}-${suffix}@test.local`;

  const { data, error } = await authAdmin.createUser({ email, password: `Senha-${suffix}`, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  cleanupAuthUserIds.push(data.user.id);

  await db.query("insert into users (id, tenant_id, role, email) values ($1, $2, $3, $4)", [
    data.user.id,
    tenantId,
    role,
    email,
  ]);

  return { id: data.user.id, tenantId, email };
}

export interface SeededMatter {
  id: string;
  tenantId: string;
  uf: string;
}

/** `status` stays `rascunho` by default — the `matters_rascunho_or_client_
 * and_catalog_set` check constraint is trivially satisfied there regardless
 * of client_id/matter_catalog_item_id, so tests can freely pass either
 * (matter-label fixtures) or neither (plain fixtures) without fighting the
 * constraint. */
export async function seedMatter(
  tenantId: string,
  opts: { uf?: string; clientId?: string | null; matterCatalogItemId?: string | null; description?: string | null } = {},
): Promise<SeededMatter> {
  const uf = opts.uf ?? "SP";
  const { rows } = await db.query<{ id: string }>(
    `insert into matters (tenant_id, client_id, matter_catalog_item_id, status, uf, description)
     values ($1, $2, $3, 'rascunho', $4, $5)
     returning id`,
    [tenantId, opts.clientId ?? null, opts.matterCatalogItemId ?? null, uf, opts.description ?? null],
  );
  return { id: rows[0]!.id, tenantId, uf };
}

export async function seedClient(tenantId: string, name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into clients (tenant_id, name) values ($1, $2) returning id",
    [tenantId, name],
  );
  return rows[0]!.id;
}

export async function seedCatalogItem(tenantId: string, name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into matter_catalog_items (tenant_id, name) values ($1, $2) returning id",
    [tenantId, name],
  );
  return rows[0]!.id;
}

export interface SeededDeadline {
  id: string;
  tenantId: string;
  matterId: string;
  dueDate: string;
}

/** `days`/`countingMode`/`startDate` are irrelevant to the alerts scan
 * (repository.ts's `fetchCandidateDeadlines` only reads `status`/`due_date`
 * plus the description/matter join columns) — filled with harmless
 * placeholders that still satisfy the table's own constraints
 * (`deadlines_days_positive`). */
export async function seedDeadline(
  tenantId: string,
  matterId: string,
  opts: { dueDate: string; description?: string; status?: "pendente" | "cumprido" },
): Promise<SeededDeadline> {
  const { rows } = await db.query<{ id: string }>(
    `insert into deadlines
       (tenant_id, matter_id, is_fatal, counting_mode, days, start_date, description, status, due_date)
     values ($1, $2, false, 'dias_uteis', 5, $3, $4, $5, $3)
     returning id`,
    [tenantId, matterId, opts.dueDate, opts.description ?? "Contestação (fixture)", opts.status ?? "pendente"],
  );
  return { id: rows[0]!.id, tenantId, matterId, dueDate: opts.dueDate };
}

export async function seedCivilHoliday(date: string, uf: string | null, name: string): Promise<void> {
  await db.query("insert into civil_holidays (date, uf, name) values ($1, $2, $3)", [date, uf, name]);
}

export async function deleteCivilHolidaysByDates(dates: string[]): Promise<void> {
  await db.query("delete from civil_holidays where date = any($1::date[])", [dates]);
}

export interface NotificationRow {
  id: string;
  tenant_id: string;
  recipient_user_id: string;
  channel: "email" | "in_app";
  category: string;
  deadline_id: string | null;
  threshold: string | null;
  payload: NotificationPayload;
  status: "pending" | "sent" | "failed";
  sent_at: string | null;
}

export async function fetchNotificationsForDeadline(deadlineId: string): Promise<NotificationRow[]> {
  const { rows } = await db.query<NotificationRow>(
    `select id, tenant_id, recipient_user_id, channel, category, deadline_id, threshold, payload, status, sent_at
     from notifications
     where deadline_id = $1
     order by threshold, channel, recipient_user_id`,
    [deadlineId],
  );
  return rows;
}

export async function cleanupAll(): Promise<void> {
  for (const id of cleanupAuthUserIds.splice(0)) {
    await authAdmin.deleteUser(id).catch(() => {});
  }
  for (const id of cleanupTenantIds.splice(0)) {
    // `clients`/`matters` explicitly, in their own statement, BEFORE the
    // tenant itself — a pre-existing, repo-wide gap this ticket's tests ran
    // straight into (not something to fix at its source, which is
    // postgres-schema-rls/04's audit trigger, well outside this ticket's
    // scope; flagged in this ticket's final report instead). Cascading
    // straight from `delete from tenants` fires each audited table's own
    // AFTER DELETE trigger (clients_audit_log_insert_delete/
    // matters_audit_log_insert_delete — see
    // 20260905023909_payments-audit-log-rls.sql), which INSERTs into
    // audit_log with the row's `tenant_id` — but by the time that cascade
    // trigger runs, the tenant row is already gone within the same
    // statement, so audit_log's FK on tenant_id fails outright ("insert or
    // update on table audit_log violates foreign key constraint"), the
    // whole DELETE errors, and this function's `.catch(() => {})` silently
    // swallows it — leaving the tenant (and everything under it,
    // deadlines/notifications included) orphaned forever. Deleting
    // clients/matters first (tenant row still present) lets that same
    // trigger's audit_log insert succeed normally; only then is the
    // now-empty-of-audited-rows tenant safely deleted, cascading cleanly to
    // users/deadlines/notifications (none of which are audited).
    await db.query("delete from matters where tenant_id = $1", [id]).catch(() => {});
    await db.query("delete from clients where tenant_id = $1", [id]).catch(() => {});
    await db.query("delete from tenants where id = $1", [id]).catch(() => {});
  }
}

export async function closeHarness(): Promise<void> {
  await db.end();
}
