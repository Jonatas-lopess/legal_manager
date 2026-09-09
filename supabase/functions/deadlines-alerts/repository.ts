// Low-level IO for the deadline-alerts Edge Function. Plain TS (no Deno
// globals) so it loads unmodified under both the Deno edge runtime (via this
// function's deno.json) and Node/vitest (via this package's own
// node_modules) — same convention as deadlines-holiday-sync/repository.ts.
//
// Direct `pg.Pool` (connected as the migration-owning `postgres` role), never
// a supabase-js/PostgREST client, for the exact same reason
// deadlines-holiday-sync/repository.ts documents at length on
// `upsertCivilHolidays`: `service_role` gets no automatic table grant on a
// new table in this project (`auto_expose_new_tables` is off). Verified
// empirically against this project's own live local stack for THIS ticket
// too (`\dp notifications`, `\dp users`, `\dp deadlines`, `\dp matters` all
// show `service_role=Dxtm/postgres` — TRUNCATE/REFERENCES/TRIGGER/MAINTAIN
// only, no SELECT/INSERT/UPDATE/DELETE) rather than assumed from that other
// function's precedent alone.
import type { Pool } from "pg";

// --- Candidate scan --------------------------------------------------------

export interface CandidateDeadlineRow {
  id: string;
  tenant_id: string;
  matter_id: string;
  description: string;
  /** `YYYY-MM-DD` (cast via `to_char` — see the query below for why). */
  due_date: string;
  uf: string;
  matter_description: string | null;
  client_name: string | null;
  catalog_item_name: string | null;
}

/**
 * Scans every `pendente` deadline whose `due_date` falls within
 * `[today, today + windowDays]`, joined to its matter's `uf` and the
 * client/catalog-item names the e-mail body needs (Part A.1/A.5).
 *
 * `pg`'s default type parser hands back a JS `Date` (local-midnight, at the
 * mercy of the runtime's timezone) for a `date` column — the same
 * off-by-one-day trap deadlines.service.ts's own doc comment warns about.
 * `to_char(..., 'YYYY-MM-DD')` sidesteps it by keeping `due_date` a plain
 * string end to end, same as deadlines-holiday-sync/test/harness.ts's
 * `seedHoliday`/`fetchHolidaysByDates`.
 */
export async function fetchCandidateDeadlines(
  db: Pool,
  todayIso: string,
  windowEndIso: string,
): Promise<CandidateDeadlineRow[]> {
  const { rows } = await db.query<CandidateDeadlineRow>(
    `select
       d.id,
       d.tenant_id,
       d.matter_id,
       d.description,
       to_char(d.due_date, 'YYYY-MM-DD') as due_date,
       m.uf,
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
     where d.status = 'pendente'
       and d.due_date >= $1
       and d.due_date <= $2
     order by d.due_date asc`,
    [todayIso, windowEndIso],
  );
  return rows;
}

// --- Holiday resolution ------------------------------------------------

interface CivilHolidayRow {
  date: string;
}

interface ForensicHolidayRow {
  start_date: string;
  end_date: string;
}

const MS_PER_DAY = 86_400_000;

/** Local, UTC-anchored "add one day" for expanding a recess range into
 * individual dates — kept self-contained rather than imported from
 * deadlines.repository.ts (this runtime area owns its own DB access, same
 * precedent deadlines-holiday-sync already set for the sync job; see this
 * ticket's brief). */
function nextIsoDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day) + MS_PER_DAY);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Direct-`pg` re-derivation of deadlines.repository.ts's
 * `resolveNonBusinessDates` — same merge/filter semantics (national + the
 * matching `uf`'s civil holidays, national-only forensic recess, range
 * `[from, to]`), but as this function's own SQL against the same two
 * reference tables rather than a supabase-js query, since this runtime talks
 * to Postgres directly (see the module comment above). Not a call into that
 * file — apps/web/src/ is application code, not a shared package, and this
 * ticket's brief is explicit that no existing Edge Function imports across
 * that boundary.
 */
export async function resolveNonBusinessDates(db: Pool, uf: string, from: string, to: string): Promise<Set<string>> {
  const [civilResult, forensicResult] = await Promise.all([
    db.query<CivilHolidayRow>(
      `select to_char(date, 'YYYY-MM-DD') as date
       from public.civil_holidays
       where (uf is null or uf = $1)
         and date >= $2
         and date <= $3`,
      [uf, from, to],
    ),
    // Range overlap test, no `uf` filter (forensic recess is national-only
    // for MVP) — same condition as deadlines.repository.ts's version.
    db.query<ForensicHolidayRow>(
      `select to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date
       from public.forensic_holidays
       where start_date <= $2
         and end_date >= $1`,
      [from, to],
    ),
  ]);

  const dates = new Set<string>();
  for (const row of civilResult.rows) dates.add(row.date);

  for (const row of forensicResult.rows) {
    const start = row.start_date > from ? row.start_date : from;
    const end = row.end_date < to ? row.end_date : to;
    let cursor = start;
    while (cursor <= end) {
      dates.add(cursor);
      cursor = nextIsoDate(cursor);
    }
  }

  return dates;
}

// --- Recipients --------------------------------------------------------

export interface RecipientRow {
  id: string;
  email: string | null;
}

/** Every user in the given tenant (spec's "Alert recipients": no
 * "responsible lawyer" field exists to narrow it further — every role has
 * `deadlines` access, ADR-0001 already establishes no within-tenant
 * isolation on matter/deadline visibility). */
export async function fetchTenantRecipients(db: Pool, tenantId: string): Promise<RecipientRow[]> {
  const { rows } = await db.query<RecipientRow>(`select id, email from public.users where tenant_id = $1`, [
    tenantId,
  ]);
  return rows;
}

interface UserEmailRow {
  id: string;
  email: string | null;
}

/** Looks up recipient e-mail addresses for a batch of user ids — used only
 * after the notifications insert below tells us which `email`-channel rows
 * were genuinely new (story 28), since `RETURNING` on an `INSERT ... SELECT`
 * can't reach back into `users` for a column that isn't part of the row
 * being inserted. */
export async function fetchUserEmailsByIds(db: Pool, userIds: string[]): Promise<Map<string, string | null>> {
  if (userIds.length === 0) return new Map();
  const { rows } = await db.query<UserEmailRow>(`select id, email from public.users where id = any($1::uuid[])`, [
    userIds,
  ]);
  return new Map(rows.map((r) => [r.id, r.email]));
}

// --- Notifications: dedup insert ---------------------------------------

export type NotificationChannel = "email" | "in_app";

export interface NotificationPayload {
  matterLabel: string;
  description: string;
  dueDate: string;
}

export interface NotificationInsert {
  tenantId: string;
  recipientUserId: string;
  channel: NotificationChannel;
  category: string;
  deadlineId: string;
  threshold: string;
  payload: NotificationPayload;
}

export interface InsertedNotification {
  id: string;
  channel: NotificationChannel;
  recipient_user_id: string;
  payload: NotificationPayload;
}

/**
 * Batched multi-row insert, deduped via
 * `ON CONFLICT (deadline_id, threshold, channel, recipient_user_id) WHERE
 * deadline_id IS NOT NULL DO NOTHING RETURNING ...` — the conflict target
 * must match the partial unique index's columns *and* predicate exactly for
 * Postgres to use it as the arbiter (see
 * packages/db/src/schema.ts's `notifications_deadline_threshold_channel_unique`
 * and its deadlines-engine-alerts/05 addendum comment: ticket 01's original
 * index only covered (deadline_id, threshold, channel), which would have
 * capped each threshold's alert at one recipient system-wide — fixed here by
 * a small follow-up migration adding `recipient_user_id` to the key, same
 * "found a gap in an earlier ticket's schema, patched via a follow-up
 * migration" precedent as `20260909163303_deadlines-days-column.sql`).
 *
 * `RETURNING` only reports rows this statement *actually* inserted — a
 * conflicting row is silently skipped, not returned — so the caller can tell
 * exactly which (deadline, threshold, channel, recipient) combinations are
 * genuinely new this run (story 28) without a separate existence check.
 */
export async function insertNotifications(
  db: Pool,
  rows: NotificationInsert[],
): Promise<InsertedNotification[]> {
  if (rows.length === 0) return [];

  const values: string[] = [];
  const params: unknown[] = [];
  rows.forEach((row, i) => {
    const offset = i * 7;
    values.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, 'pending')`,
    );
    params.push(
      row.tenantId,
      row.recipientUserId,
      row.channel,
      row.category,
      row.deadlineId,
      row.threshold,
      JSON.stringify(row.payload),
    );
  });

  const { rows: inserted } = await db.query<InsertedNotification>(
    `insert into public.notifications
       (tenant_id, recipient_user_id, channel, category, deadline_id, threshold, payload, status)
     values ${values.join(", ")}
     on conflict (deadline_id, threshold, channel, recipient_user_id) where deadline_id is not null
     do nothing
     returning id, channel, recipient_user_id, payload`,
    params,
  );
  return inserted;
}

/** Isolated per-row (Part A.5: "one failure doesn't sink the batch"). */
export async function markNotificationSent(db: Pool, id: string): Promise<void> {
  await db.query(`update public.notifications set status = 'sent', sent_at = now() where id = $1`, [id]);
}

export async function markNotificationFailed(db: Pool, id: string): Promise<void> {
  await db.query(`update public.notifications set status = 'failed' where id = $1`, [id]);
}

// ---------------------------------------------------------------------------
// Resend HTTP boundary
//
// VERIFIED against Resend's live published docs
// (https://resend.com/docs/api-reference/emails/send-email, fetched
// 2026-09-09 via WebFetch) — unlike deadlines-holiday-sync/repository.ts's
// FeriadosAPI block, which is explicitly flagged as unverified guesswork,
// this one *was* checked against real docs: `POST https://api.resend.com/
// emails`, `Authorization: Bearer <key>`, JSON body `{ from, to, subject,
// html }` (to/from as plain address strings — no display-name object shape
// needed here), success response `{ id: string }`, and 400/401/422/429/5xx
// on failure. What's still unverified: no real Resend account/API key was
// available to actually send a request end-to-end as part of this ticket —
// only the documented shape, not live behavior, is confirmed. See this
// ticket's final report.
const RESEND_API_URL = "https://api.resend.com/emails";

export interface SendEmailInput {
  to: string;
  payload: NotificationPayload;
}

/** Minimal, self-contained body (story 31) — everything it names comes
 * straight from the `notifications` row's own `payload` snapshot, so the
 * e-mail is legible even if `matters`/`clients` data changes later. */
function buildEmailContent(input: SendEmailInput): { subject: string; html: string } {
  const { description, matterLabel, dueDate } = input.payload;
  return {
    subject: `Prazo: ${description} — vence em ${dueDate}`,
    html:
      `<p>O prazo <strong>${escapeHtml(description)}</strong> do processo ` +
      `<strong>${escapeHtml(matterLabel)}</strong> vence em <strong>${escapeHtml(dueDate)}</strong>.</p>`,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Real network call to Resend for one recipient — the production
 * `sendEmail` implementation `index.ts` wires up. Tests inject their own
 * stub instead (see service.ts's `AlertsDeps.sendEmail`), same seam as
 * deadlines-holiday-sync/service.ts's `SyncDeps.fetchHolidays` and this
 * ticket's own Testing Decisions ("Resend HTTP call mocked at the
 * boundary").
 */
export async function sendAlertEmailViaResend(
  apiKey: string,
  fromEmail: string,
  input: SendEmailInput,
): Promise<void> {
  const { subject, html } = buildEmailContent(input);
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: fromEmail, to: input.to, subject, html }),
  });
  if (!response.ok) {
    throw new Error(`Resend request failed (${response.status} ${response.statusText}) for recipient ${input.to}`);
  }
}
