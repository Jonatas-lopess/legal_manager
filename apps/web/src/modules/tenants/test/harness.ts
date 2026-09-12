import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client, Pool } from "pg";

// Real local Supabase stack (`supabase start`) — GoTrue + Postgres +
// Mailpit, never a mocked client (spec's testing decision: an auth/invite
// flow is exactly what a mock would give false confidence about).
const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:55321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:55324";

export const db = new Pool({ connectionString: DB_URL });
const authAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
}).auth.admin;

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

export interface SeededUser {
  id: string;
  tenantId: string;
  email: string;
  password: string;
}

const cleanupTenantIds: string[] = [];
const cleanupAuthUserIds: string[] = [];

async function seedUser(tenantId: string, role: "admin" | "advogado" | "secretario"): Promise<SeededUser> {
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

  return { id: data.user.id, tenantId, email, password };
}

export async function seedTenant(): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into tenants (name) values ($1) returning id",
    [`Tenant ${randomUUID()}`],
  );
  const tenantId = rows[0]!.id;
  cleanupTenantIds.push(tenantId);
  return tenantId;
}

export async function seedAdmin(tenantId: string): Promise<SeededUser> {
  return seedUser(tenantId, "admin");
}

export async function seedMember(
  tenantId: string,
  role: "advogado" | "secretario",
): Promise<SeededUser> {
  return seedUser(tenantId, role);
}

/**
 * Deletes a previously-seeded auth user outright, mid-test — distinct from
 * `cleanupAll` (which runs at teardown for every module's tests). For tests
 * that need to exercise a live on-delete-cascade while the test is still
 * running (e.g. `audit_log.user_id`'s `ON DELETE SET NULL` — see
 * modules/audit/test/audit.service.test.ts), not just tidy up afterward.
 * `public.users.id` FK's `ON DELETE CASCADE` against `auth.users` means this
 * also removes the `users` row. Safe to re-pass the same id to `cleanupAll`
 * afterward — its own `authAdmin.deleteUser` call there is `.catch`-guarded.
 */
export async function deleteAuthUser(userId: string): Promise<void> {
  await authAdmin.deleteUser(userId).catch(() => {});
}

export async function cleanupAll() {
  for (const id of cleanupAuthUserIds.splice(0)) {
    await authAdmin.deleteUser(id).catch(() => {});
  }
  for (const id of cleanupTenantIds.splice(0)) {
    await db.query("delete from tenants where id = $1", [id]).catch(() => {});
  }
}

export async function closeHarness() {
  await db.end();
}

interface MailpitMessageSummary {
  ID: string;
  To: { Address: string }[];
  Subject: string;
  Created: string;
}

interface MailpitMessage {
  HTML: string;
  Text: string;
}

/** Polls Mailpit for the most recent message to `email` with the given subject substring. */
export async function waitForMailpitMessage(email: string, subjectIncludes: string, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=50`);
    const { messages } = (await res.json()) as { messages: MailpitMessageSummary[] };
    const match = messages.find(
      (m) => m.To.some((to) => to.Address === email) && m.Subject.includes(subjectIncludes),
    );
    if (match) {
      const full = await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`);
      return (await full.json()) as MailpitMessage;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No Mailpit message to ${email} with subject containing "${subjectIncludes}" within ${timeoutMs}ms`);
}

/** Extracts GoTrue's `token=<hash>&type=<type>` verify-link params from a captured email body. */
export function extractVerifyTokenHash(message: MailpitMessage): string {
  const body = message.HTML || message.Text;
  const match = body.match(/[?&]token=([^&"'\s]+)/);
  if (!match) throw new Error("No verify token found in email body");
  return match[1]!;
}
