// Low-level IO for the daily-summary Edge Function. Plain TS (no Deno
// globals) so it loads unmodified under both the Deno edge runtime (via this
// function's deno.json) and Node/vitest — same convention as
// deadlines-alerts/repository.ts.
//
// Direct `pg.Pool` (connected as the migration-owning `postgres` role), never
// a supabase-js/PostgREST client — same reasoning deadlines-alerts/
// repository.ts documents at length: `service_role` gets no automatic SELECT
// grant on `deadlines`/`matters`/`clients`/`matter_catalog_items` in this
// project (`auto_expose_new_tables` is off), verified empirically for that
// ticket and not re-verified here since nothing about those grants changed.
import type { Pool } from "pg";

export interface DeadlineRow {
  id: string;
  description: string;
  /** `YYYY-MM-DD` (cast via `to_char`, same off-by-one-day trap as
   * deadlines-alerts/repository.ts's `fetchCandidateDeadlines` documents). */
  due_date: string;
  is_fatal: boolean;
  matter_description: string | null;
  client_name: string | null;
  catalog_item_name: string | null;
}

/**
 * Every `pendente` deadline for `tenantId` with `due_date <= windowEndIso`
 * (overdue ones included — no lower bound), joined to the client/catalog
 * labels a human-readable summary needs. Service-layer buckets the result
 * into overdue / due-today / due-this-week (see service.ts's
 * `categorizeDeadlines`) rather than three separate queries — same row set
 * either way, one round trip.
 */
export async function fetchPendingDeadlines(db: Pool, tenantId: string, windowEndIso: string): Promise<DeadlineRow[]> {
  const { rows } = await db.query<DeadlineRow>(
    `select
       d.id,
       d.description,
       to_char(d.due_date, 'YYYY-MM-DD') as due_date,
       d.is_fatal,
       m.description as matter_description,
       c.name as client_name,
       mci.name as catalog_item_name
     from public.deadlines d
     join public.matters m
       on m.id = d.matter_id and m.tenant_id = d.tenant_id
     left join public.clients c
       on c.id = m.client_id and c.tenant_id = m.tenant_id
     left join public.matter_catalog_items mci
       on mci.id = m.matter_catalog_item_id and mci.tenant_id = m.tenant_id
     where d.tenant_id = $1
       and d.status = 'pendente'
       and d.due_date <= $2
     order by d.due_date asc`,
    [tenantId, windowEndIso],
  );
  return rows;
}

/** Active-matters count for the tenant — `em_andamento` only, same status the
 * `reports` module's `getMattersEmAndamento` counts (apps/web/src/modules/
 * reports/reports.service.ts), re-derived here rather than imported since
 * this runtime doesn't cross the apps/web <-> supabase/functions boundary
 * (same precedent as deadlines-alerts). */
export async function fetchActiveMattersCount(db: Pool, tenantId: string): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `select count(*)::text as count from public.matters where tenant_id = $1 and status = 'em_andamento'`,
    [tenantId],
  );
  return Number(rows[0]?.count ?? "0");
}

// --- Caller identity ---------------------------------------------------

/**
 * Resolves the calling end-user's `tenant_id` from their JWT — same
 * two-step shape as supabase/functions/tenants/repository.ts's own caller
 * resolution (Auth lookup, then a `public.users` row lookup by id), kept
 * self-contained rather than imported across function boundaries (no
 * existing Edge Function imports another function's repository.ts).
 */
export async function resolveTenantIdForUser(
  authClient: { auth: { getUser(jwt: string): Promise<{ data: { user: { id: string } | null }; error: unknown }> } },
  db: Pool,
  jwt: string,
): Promise<string | null> {
  const { data, error } = await authClient.auth.getUser(jwt);
  if (error || !data.user) return null;

  const { rows } = await db.query<{ tenant_id: string }>(`select tenant_id from public.users where id = $1`, [
    data.user.id,
  ]);
  return rows[0]?.tenant_id ?? null;
}

// ---------------------------------------------------------------------------
// Groq chat-completions API boundary (decision 2026-09-22: Groq's free tier
// over Anthropic — this feature is a low-stakes, low-volume summarization
// read, not worth a paid key for the MVP; see PLANNING.md §5).
//
// Raw `fetch`, not an SDK — same reasoning as this sibling function's Resend
// integration (deadlines-alerts/repository.ts's module comment on
// `sendAlertEmailViaResend`): this file has to load unmodified under both the
// Deno edge runtime and Node/vitest (see the module comment above), and a
// Deno-only `npm:` value import wouldn't resolve under vitest's Node runtime
// the way a bare `pg`/`@supabase/supabase-js` package (installed for real in
// package.json) does. `fetch` is a global in both runtimes, so it sidesteps
// the problem entirely. OpenAI-compatible request/response shape verified
// against Groq's published docs (console.groq.com/docs/api-reference#chat-create).
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
// Groq's current-generation general-purpose free-tier model. Swap here if
// Groq deprecates it — nothing else in this file depends on the model id.
const GROQ_MODEL = "llama-3.3-70b-versatile";

interface GroqChatResponse {
  choices: { message: { content: string | null }; finish_reason: string }[];
}

export interface CallModelInput {
  system: string;
  user: string;
}

/**
 * One-shot, non-streaming call — the daily summary is a short paragraph, well
 * under any HTTP-timeout-relevant output size, so streaming would add
 * complexity with no benefit here.
 */
export async function callGroq(apiKey: string, input: CallModelInput): Promise<string> {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 1024,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Groq request failed (${response.status} ${response.statusText}): ${body}`);
  }

  const message = (await response.json()) as GroqChatResponse;
  const text = message.choices[0]?.message.content;
  if (!text) throw new Error("Groq response had no text content");
  return text;
}
