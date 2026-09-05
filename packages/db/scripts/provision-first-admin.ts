#!/usr/bin/env node
/**
 * First-tenant/first-admin provisioning (PLANNING §8: no self-service
 * signup). Creates one `tenants` row and one `public.users` row
 * (`role = 'admin'`) linked to a real Supabase Auth user, via the same Auth
 * Admin API path `tenants-auth-invite`'s invite Edge Function uses.
 *
 * Not reachable from `apps/web` — CLI/ops tooling only, run against the
 * local Supabase stack for manual onboarding or integration-test setup.
 *
 * Usage:
 *   pnpm --filter @legal-manager/db provision-first-admin \
 *     --tenant "Escritório Exemplo" --email admin@example.com --password 'trocar123!'
 *
 * `--password` is optional — omit it to have one generated and printed once.
 *
 * Required env (see .env.example): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * SUPABASE_DB_URL.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

interface Args {
  tenant: string;
  email: string;
  password: string;
  generatedPassword: boolean;
}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(key, next);
      i++;
    } else {
      flags.set(key, "true");
    }
  }

  const tenant = flags.get("tenant");
  const email = flags.get("email");
  if (!tenant || !email) {
    throw new Error(
      "Usage: provision-first-admin --tenant <name> --email <email> [--password <password>]",
    );
  }

  const generatedPassword = !flags.has("password");
  const password = flags.get("password") ?? randomBytes(12).toString("base64url");

  return { tenant, email, password, generatedPassword };
}

async function main() {
  const { tenant, email, password, generatedPassword } = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!supabaseUrl || !serviceRoleKey || !dbUrl) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_DB_URL (see .env.example)",
    );
  }

  // Admin API only — never opens a Data API path to `tenants`/`users`,
  // since `service_role` has no table grant on either (see
  // packages/db/README.md's RLS pattern: only `authenticated` is granted
  // SELECT). Row provisioning below goes over a direct Postgres connection
  // instead, the same reason the invite Edge Function's repository does.
  const auth = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).auth.admin;

  const { data: created, error: createError } = await auth.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw createError ?? new Error("Auth user creation returned no user");
  }
  const authUserId = created.user.id;

  const db = new Client({ connectionString: dbUrl });
  await db.connect();
  try {
    const { rows } = await db.query<{ id: string }>(
      "insert into tenants (name) values ($1) returning id",
      [tenant],
    );
    const tenantId = rows[0]!.id;

    await db.query("insert into users (id, tenant_id, role, email) values ($1, $2, 'admin', $3)", [
      authUserId,
      tenantId,
      email,
    ]);

    console.log(`Tenant provisioned: ${tenant} (${tenantId})`);
    console.log(`Admin user provisioned: ${email} (${authUserId})`);
    if (generatedPassword) {
      console.log(`Generated password (shown once): ${password}`);
    }
  } catch (error) {
    // Never leave an Auth account without its tenant row — same
    // never-orphan invariant the invite Edge Function keeps.
    await auth.deleteUser(authUserId).catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
