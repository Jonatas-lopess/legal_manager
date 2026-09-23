// Deno edge-runtime entrypoint — not typechecked by this package's tsc (see
// tsconfig.json's `exclude`) and not imported by the vitest suite;
// service.ts/repository.ts hold the actual logic under test. `npm:` here is
// Deno's own npm-package specifier, same convention as
// deadlines-alerts/index.ts and supabase/functions/tenants/index.ts.
//
// User-triggered (dashboard fetch, real end-user JWT) — `verify_jwt = false`
// in supabase/config.toml because this function verifies the JWT itself via
// service.ts's `generateDailySummary` -> repository.ts's
// `resolveTenantIdForUser`, same shape as supabase/functions/tenants/index.ts.
import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { Pool } from "npm:pg@8.23.0";
import { callGroq } from "./repository.ts";
import { generateDailySummary, HttpError } from "./service.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const supabaseUrl = requireEnv("SUPABASE_URL");
const anonKey = requireEnv("SUPABASE_ANON_KEY");
const dbUrl = requireEnv("SUPABASE_DB_URL");
const groqApiKey = requireEnv("GROQ_API_KEY");

const authClient = createClient(supabaseUrl, anonKey);
// One pooled connection, reused across invocations for this function's
// lifetime — not opened per-request (same convention as every other
// function in this directory).
const db = new Pool({ connectionString: dbUrl });

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  try {
    const result = await generateDailySummary(
      { db, authClient, callModel: (input) => callGroq(groqApiKey, input) },
      jwt,
    );
    return jsonResponse(result, 200);
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    console.error(error);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
