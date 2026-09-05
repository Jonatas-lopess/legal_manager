import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { GenericContainer, Wait } from "testcontainers";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const stateFile = path.join(testDir, ".container-state.json");
const migrationsDir = path.resolve(testDir, "../../../supabase/migrations");

// Real, disposable Postgres per test run (spec's own testing decision: "real
// Postgres... never a mocked query builder"). Same image the local Supabase
// stack uses — its own init already bakes in the full `auth` schema
// (including the `auth.users` table our FK references and the `auth.uid()`
// function our RLS policies call), no GoTrue process required.
export default async function setup() {
  const container = await new GenericContainer("public.ecr.aws/supabase/postgres:17.6.1.136")
    .withEnvironment({ POSTGRES_PASSWORD: "postgres" })
    .withExposedPorts(5432)
    // First boot runs Supabase's own long migration set (auth/extensions/
    // roles) before the real server restart — the "ready" message appears
    // once for the transient initdb server, once for the real one.
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .withStartupTimeout(300_000)
    .start();

  const connectionString = `postgresql://postgres:postgres@${container.getHost()}:${container.getMappedPort(5432)}/postgres`;

  // The "ready" log line can land a moment before the postmaster actually
  // accepts TCP connections on the mapped port — retry rather than fail
  // setup on that race.
  const client = new Client({ connectionString });
  for (let attempt = 1; ; attempt++) {
    try {
      await client.connect();
      break;
    } catch (error) {
      if (attempt >= 10) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  try {
    // A real Supabase-CLI-managed project locks this down as part of its own
    // bootstrap (`auto_expose_new_tables`, see supabase/config.toml) — a
    // bare Postgres container from this image does not, so anon/
    // authenticated/service_role would otherwise get every privilege on
    // every new table for free, silently defeating our own GRANT/REVOKE
    // migrations (this bit our own column-level retention_until lockdown
    // during development: it appeared to do nothing against this harness).
    await client.query(`
      alter default privileges for role postgres in schema public
        revoke all on tables from anon, authenticated, service_role;
      alter default privileges for role postgres in schema public
        revoke all on sequences from anon, authenticated, service_role;
      alter default privileges for role postgres in schema public
        revoke all on functions from anon, authenticated, service_role;
    `);

    const migrationFiles = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const name of migrationFiles) {
      await client.query(readFileSync(path.join(migrationsDir, name), "utf8"));
    }
  } finally {
    await client.end();
  }

  mkdirSync(testDir, { recursive: true });
  writeFileSync(stateFile, JSON.stringify({ connectionString }));

  return async () => {
    await container.stop();
  };
}
