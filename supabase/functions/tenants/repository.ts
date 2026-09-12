// Low-level IO for the invite Edge Function. Plain TS (no Deno globals) so
// it loads unmodified under both the Deno edge runtime (via
// supabase/functions/import_map.json's npm: rewrites) and Node/vitest (via
// this package's own node_modules) — see service.test.ts.
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Pool } from "pg";

/** Verifies the JWT against GoTrue itself — never decoded/trusted locally. */
export async function verifyJwt(authClient: SupabaseClient, jwt: string): Promise<User | null> {
  const { data, error } = await authClient.auth.getUser(jwt);
  if (error || !data.user) return null;
  return data.user;
}

export interface CallerMembership {
  tenantId: string;
  role: string;
}

/**
 * Direct Postgres read (never PostgREST): `service_role` has no table grant
 * on `users` in this schema (only `authenticated` gets SELECT — see
 * packages/db/README.md's RLS pattern), and this needs to read the
 * *caller's* row regardless of RLS/grants to derive their real tenant/role.
 */
export async function fetchCallerMembership(db: Pool, userId: string): Promise<CallerMembership | null> {
  const { rows } = await db.query<{ tenant_id: string; role: string }>(
    "select tenant_id, role from public.users where id = $1",
    [userId],
  );
  const row = rows[0];
  return row ? { tenantId: row.tenant_id, role: row.role } : null;
}

type AuthAdmin = SupabaseClient["auth"]["admin"];

/** Sends Supabase's built-in invite email (captured by Inbucket/Mailpit locally). */
export async function inviteUserByEmail(authAdmin: AuthAdmin, email: string) {
  return authAdmin.inviteUserByEmail(email);
}

export async function deleteAuthUser(authAdmin: AuthAdmin, userId: string): Promise<void> {
  await authAdmin.deleteUser(userId).catch(() => {});
}

export interface NewTenantMember {
  id: string;
  tenantId: string;
  role: string;
  email: string;
}

/** Same direct-Postgres reasoning as fetchCallerMembership — see above. */
export async function insertTenantMember(db: Pool, member: NewTenantMember): Promise<void> {
  await db.query("insert into public.users (id, tenant_id, role, email) values ($1, $2, $3, $4)", [
    member.id,
    member.tenantId,
    member.role,
    member.email,
  ]);
}

export interface TargetMember {
  tenantId: string;
  role: string;
}

/** Same direct-Postgres reasoning as fetchCallerMembership — looks up the
 * *target* of a removal regardless of RLS, so `removeMember` can verify it
 * belongs to the caller's own tenant before touching it. */
export async function fetchMemberById(db: Pool, userId: string): Promise<TargetMember | null> {
  const { rows } = await db.query<{ tenant_id: string; role: string }>(
    "select tenant_id, role from public.users where id = $1",
    [userId],
  );
  const row = rows[0];
  return row ? { tenantId: row.tenant_id, role: row.role } : null;
}

/** Used by removeMember's fast-path pre-check — see service.ts. */
export async function countAdminsInTenant(db: Pool, tenantId: string): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    "select count(*)::text as count from public.users where tenant_id = $1 and role = 'admin'",
    [tenantId],
  );
  return Number(rows[0]?.count ?? 0);
}

/** Raised by deleteTenantMember when the target is the tenant's last admin. */
export class LastAdminError extends Error {}

/**
 * Same direct-Postgres reasoning as insertTenantMember — the reverse write,
 * but wrapped in its own transaction: it first locks every admin row of the
 * tenant (`for update`), *then* checks whether the target is the tenant's
 * last admin, and only then deletes — closing the TOCTOU race two
 * concurrent removeMember calls would otherwise hit (each reading a passing
 * admin count before either commits). Only ever raises `LastAdminError` for
 * this one write path — direct deletion of a `users` row from elsewhere
 * (e.g. cascading from an Auth user deletion, see audit.service.test.ts's
 * "surfaces a row with a null actor" case) is untouched, deliberately: this
 * repo already relies on a tenant being able to end up with zero admins via
 * that path, so the guard can't be a blanket DB-level constraint/trigger,
 * only this call site's own check.
 */
export async function deleteTenantMember(db: Pool, userId: string, tenantId: string): Promise<void> {
  const client = await db.connect();
  try {
    await client.query("begin");
    await client.query("select 1 from public.users where tenant_id = $1 and role = 'admin' for update", [
      tenantId,
    ]);

    const { rows: targetRows } = await client.query<{ role: string }>(
      "select role from public.users where id = $1",
      [userId],
    );
    if (targetRows[0]?.role === "admin") {
      const { rows: countRows } = await client.query<{ count: string }>(
        "select count(*)::text as count from public.users where tenant_id = $1 and role = 'admin'",
        [tenantId],
      );
      if (Number(countRows[0]?.count ?? 0) <= 1) {
        throw new LastAdminError("Não é possível remover o último administrador do escritório.");
      }
    }

    await client.query("delete from public.users where id = $1", [userId]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
