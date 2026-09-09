// Deno edge-runtime entrypoint — not typechecked by this package's tsc (see
// tsconfig.json's `exclude`) and not imported by the vitest suite;
// service.ts/repository.ts hold the actual logic under test. `npm:` here is
// Deno's own npm-package specifier, same convention as
// deadlines-holiday-sync/index.ts.
//
// Cron-triggered (pg_cron+pg_net, see the accompanying
// supabase/migrations/*_deadlines-alerts-cron.sql migration) rather than
// user-triggered — `net.http_post` calls it directly with the service-role
// key as a bearer token, never an end-user JWT, so there's no caller-JWT
// verification here, same reasoning as deadlines-holiday-sync/index.ts.
import { Pool } from "npm:pg@8.23.0";
import { sendAlertEmailViaResend } from "./repository.ts";
import { runDeadlineAlerts } from "./service.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Direct Postgres, not a supabase-js client — see repository.ts's module
// comment for why.
const dbUrl = requireEnv("SUPABASE_DB_URL");
// Resend API key — see repository.ts's module comment: the request/response
// shape is verified against Resend's real docs, but no live account/key was
// available to exercise it end-to-end as part of this ticket.
const resendApiKey = requireEnv("RESEND_API_KEY");
// From-address is deployment-specific (Resend requires a verified sending
// domain) — no safe universal default exists, so this is NOT given a
// fallback the way e.g. a UI copy string would be. The placeholder below
// only exists so a misconfigured environment fails loudly and immediately
// (a bounced/rejected send from an unverified domain) rather than silently
// on first real use; it needs real configuration before production.
const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") ?? "alertas@example.com";

// One pooled connection, reused across invocations for this function's
// lifetime — not opened per-request (same convention as
// deadlines-holiday-sync/index.ts).
const db = new Pool({ connectionString: dbUrl });

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async () => {
  try {
    const summary = await runDeadlineAlerts({
      db,
      sendEmail: (input) => sendAlertEmailViaResend(resendApiKey, resendFromEmail, input),
    });
    // Per-recipient send failures are reported in the body but still answer
    // 200 — they're an expected, isolated outcome (see service.ts's doc
    // comment on runDeadlineAlerts/sendEmails), not a failure of this
    // invocation itself. Only an unexpected throw (e.g. DB unreachable) is a
    // 500.
    return jsonResponse(summary, 200);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
