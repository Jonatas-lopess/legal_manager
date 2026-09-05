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
