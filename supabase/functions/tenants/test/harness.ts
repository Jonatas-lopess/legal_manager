import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client, Pool } from "pg";

// Defaults are the fixed local-dev demo values `supabase init` bakes into
// every project's config.toml (same JWT_SECRET everywhere) — not secrets,
// just enough for `pnpm test` to work against a `supabase start`'d stack
// with zero env setup. Override via env for CI/a differently-configured
// stack.
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:55321";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

export const db = new Pool({ connectionString: DB_URL });
export const authClient = createClient(SUPABASE_URL, ANON_KEY);
const authAdminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
export const authAdmin = authAdminClient.auth.admin;

/**
 * Verifies the stack this suite needs is actually reachable before any test
 * runs. Uses its own short-lived connection, never the module-level `db`
 * Pool above — vitest's `globalSetup` runs in a separate process from test
 * files, so that Pool belongs to a different instance of this module
 * entirely (see global-setup.ts).
 */
export async function assertStackReachable() {
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

export interface SeededTenant {
  tenantId: string;
  adminId: string;
  adminEmail: string;
  adminPassword: string;
}

const cleanupTenantIds: string[] = [];
const cleanupAuthUserIds: string[] = [];

/** Real tenant + real GoTrue admin user, provisioned the same way the ops script does. */
export async function seedTenantWithAdmin(): Promise<SeededTenant> {
  const suffix = randomUUID();
  const email = `admin-${suffix}@test.local`;
  const password = `Senha-${suffix}`;

  const { rows } = await db.query<{ id: string }>(
    "insert into tenants (name) values ($1) returning id",
    [`Tenant ${suffix}`],
  );
  const tenantId = rows[0]!.id;
  cleanupTenantIds.push(tenantId);

  const { data, error } = await authAdmin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  cleanupAuthUserIds.push(data.user.id);

  await db.query("insert into users (id, tenant_id, role, email) values ($1, $2, 'admin', $3)", [
    data.user.id,
    tenantId,
    email,
  ]);

  return { tenantId, adminId: data.user.id, adminEmail: email, adminPassword: password };
}

/** A member of `tenantId` with the given role — originally just non-admin
 * members for the "rejected" test paths, "admin" added so removeMember's
 * tests can seed a *second* admin (e.g. to exercise self-removal being
 * blocked even when another admin exists, distinct from the last-admin
 * guardrail). */
export async function seedMember(tenantId: string, role: "admin" | "advogado" | "secretario") {
  const suffix = randomUUID();
  const email = `${role}-${suffix}@test.local`;
  const password = `Senha-${suffix}`;

  const { data, error } = await authAdmin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  cleanupAuthUserIds.push(data.user.id);

  await db.query("insert into users (id, tenant_id, role, email) values ($1, $2, $3, $4)", [
    data.user.id,
    tenantId,
    role,
    email,
  ]);

  return { id: data.user.id, email, password };
}

export async function signIn(email: string, password: string): Promise<string> {
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw error ?? new Error("sign-in returned no session");
  return data.session.access_token;
}

/** Row count for a tenant's `users` — used to assert a rejected invite created nothing. */
export async function countUsersInTenant(tenantId: string): Promise<number> {
  const { rows } = await db.query<{ count: string }>("select count(*)::int as count from users where tenant_id = $1", [
    tenantId,
  ]);
  return Number(rows[0]!.count);
}

export async function cleanupAll() {
  for (const id of cleanupAuthUserIds.splice(0)) {
    await authAdmin.deleteUser(id).catch(() => {});
  }
  for (const id of cleanupTenantIds.splice(0)) {
    // Cascades to any remaining `users` rows for the tenant.
    await db.query("delete from tenants where id = $1", [id]).catch(() => {});
  }
}

export async function closeHarness() {
  await db.end();
}
