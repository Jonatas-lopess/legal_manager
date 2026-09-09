// Deno edge-runtime entrypoint — not typechecked by this package's tsc (see
// tsconfig.json's `exclude`) and not imported by the vitest suite;
// service.ts/repository.ts hold the actual logic under test. `npm:` here is
// Deno's own npm-package specifier, same convention as
// supabase/functions/tenants/index.ts.
//
// Unlike tenants/index.ts, this function is cron-triggered (pg_cron+pg_net,
// see the accompanying supabase/migrations/*_deadlines-holiday-sync-cron.sql
// migration) rather than user-triggered — `net.http_post` calls it directly
// with the service-role key as a bearer token, never an end-user JWT, so
// there's no caller-JWT verification here the way tenants/service.ts's
// inviteUser does.
import { Pool } from "npm:pg@8.23.0";
import { fetchHolidaysFromFeriadosApi } from "./repository.ts";
import { syncCivilHolidays } from "./service.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Direct Postgres, not a supabase-js client — see repository.ts's
// upsertCivilHolidays doc comment for why.
const dbUrl = requireEnv("SUPABASE_DB_URL");
// FeriadosAPI key — see repository.ts's module comment: the
// Authorization: Bearer <key> auth shape is a best-effort read of the
// public docs, not verified against a real account.
const feriadosApiKey = requireEnv("FERIADOS_API_KEY");

// One pooled connection, reused across invocations for this function's
// lifetime — not opened per-request (same convention as tenants/index.ts).
const db = new Pool({ connectionString: dbUrl });

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async () => {
  try {
    const summary = await syncCivilHolidays({
      db,
      fetchHolidays: (jurisdiction, year) => fetchHolidaysFromFeriadosApi(feriadosApiKey, jurisdiction, year),
    });
    // Per-jurisdiction failures are reported in the body but still answer
    // 200 — they're an expected, isolated outcome (see service.ts's doc
    // comment on syncCivilHolidays), not a failure of this invocation
    // itself. Only an unexpected throw (e.g. Postgres unreachable) is a 500.
    return jsonResponse(summary, 200);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
