// Deno edge-runtime entrypoint — not typechecked by this package's tsc
// (see tsconfig.json's `exclude`) and not imported by the vitest suite;
// service.ts/repository.ts hold the actual logic under test. `npm:` here is
// Deno's own npm-package specifier — service.ts/repository.ts only need
// these two packages for types (`import type`, erased at runtime), so only
// this file's *value* imports need resolving; `@legal-manager/schema` is a
// real runtime import there too, so it goes through
// supabase/functions/import_map.json instead (relative paths / non-npm
// bare specifiers aren't valid unprefixed in Deno).
import { createClient } from "npm:@supabase/supabase-js@2.49.0";
import { Pool } from "npm:pg@8.23.0";
import { HttpError, inviteUser, removeMember } from "./service.ts";

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
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const dbUrl = requireEnv("SUPABASE_DB_URL");

const authClient = createClient(supabaseUrl, anonKey);
const authAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
}).auth.admin;
// One pooled connection, reused across invocations for this function's
// lifetime — not opened per-request.
const db = new Pool({ connectionString: dbUrl });

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Routed by HTTP method, one action per verb (ticket 04's call — a body
// discriminator was the other option, but `inviteUser`'s body has no such
// field today and this avoids changing its shape): POST invites, DELETE
// removes a member.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "DELETE") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  try {
    if (req.method === "POST") {
      const result = await inviteUser({ authClient, authAdmin, db }, jwt, body);
      return jsonResponse(result, 201);
    }

    const result = await removeMember({ authClient, authAdmin, db }, jwt, body);
    return jsonResponse(result, 200);
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    console.error(error);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
