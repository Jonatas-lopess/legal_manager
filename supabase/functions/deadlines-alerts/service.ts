// Business logic for the deadline-alerts Edge Function — the seam under
// test. Typed `deps` (injectable Postgres pool + the Resend HTTP boundary,
// plus an injectable `today` for deterministic tests), no Deno-specific
// globals — same convention as deadlines-holiday-sync/service.ts.
import type { Pool } from "pg";
import * as repo from "./repository.ts";
import type { CandidateDeadlineRow, InsertedNotification, NotificationPayload, SendEmailInput } from "./repository.ts";

// --- Pure date arithmetic ---------------------------------------------
//
// Re-derived from apps/web/src/modules/deadlines/deadlines.service.ts's
// `computeDueDate` rather than imported — this ticket's brief is explicit
// that apps/web/src/ is application code, not a shared package, and no
// existing Edge Function imports across that boundary. Kept byte-for-byte
// equivalent in behavior (same UTC-anchored parsing, same weekend/holiday
// rules) so "N dias úteis" means the same thing here as it does in the
// engine — see `businessDaysForward`'s doc comment for exactly how the two
// algorithms line up.

const MS_PER_DAY = 86_400_000;

function toUtcMs(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function toIsoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function addCalendarDays(iso: string, days: number): string {
  return toIsoDate(toUtcMs(iso) + days * MS_PER_DAY);
}

function isWeekend(iso: string): boolean {
  const day = new Date(toUtcMs(iso)).getUTCDay();
  return day === 0 || day === 6;
}

function isBusinessDay(iso: string, nonBusinessDates: Set<string>): boolean {
  return !isWeekend(iso) && !nonBusinessDates.has(iso);
}

/**
 * Walks forward from `from` counting business days, exactly like
 * `computeDueDate`'s `dias_uteis` branch's core loop — `from` itself is
 * never counted (walk forward one calendar day at a time first, then check),
 * a day only counts toward `n` when it's a business day, and the function
 * returns the date the count is satisfied on.
 *
 * Deliberately does NOT apply `computeDueDate`'s `nextBusinessDay(startDate,
 * ...)` pre-step: that step exists to handle a deadline's own `start_date`
 * possibly falling on a non-business day (CPC art. 224, story 14) — it's
 * about where a *deadline's* count begins, not about "today" as a threshold
 * check's reference point. This ticket's spec spells the algorithm out
 * explicitly in exactly this form ("today itself doesn't count, walk forward
 * one calendar day at a time... until you've counted exactly threshold
 * business days") without that adjustment, and it wouldn't change the
 * result's *comparison* to `due_date` anyway: whether "today" itself happens
 * to be a business day is irrelevant since it's never counted either way.
 *
 * `due_date` fires threshold `N` today iff
 * `businessDaysForward(today, N, nonBusinessDates) === due_date` — this one
 * helper is reused for both `N=5` and `N=1` per deadline (see
 * `detectFiringThresholds`).
 */
export function businessDaysForward(from: string, n: number, nonBusinessDates: Set<string>): string {
  let cursor = from;
  let remaining = n;
  while (remaining > 0) {
    cursor = addCalendarDays(cursor, 1);
    if (isBusinessDay(cursor, nonBusinessDates)) remaining--;
  }
  return cursor;
}

// --- Threshold detection -------------------------------------------------

/** Fixed, global thresholds (spec: "MVP alert thresholds are fixed and
 * identical for fatal/non-fatal... sem configuração por tenant") — order
 * matters only for the `threshold` label lookup below, not for correctness. */
export const THRESHOLDS = [5, 1] as const;
export type Threshold = (typeof THRESHOLDS)[number];

const THRESHOLD_LABELS: Record<Threshold, string> = {
  5: "5_dias_uteis",
  1: "1_dia_util",
};

/**
 * Which of `THRESHOLDS` fire today for one candidate deadline, given its
 * fully-resolved non-business-date set over `[today, due_date]` (that range
 * is always sufficient — see repository.ts's `resolveNonBusinessDates` call
 * site in `runDeadlineAlerts` for why a wider range is never needed even
 * though `businessDaysForward` could in principle walk past `due_date`).
 */
export function detectFiringThresholds(today: string, dueDate: string, nonBusinessDates: Set<string>): Threshold[] {
  return THRESHOLDS.filter((threshold) => businessDaysForward(today, threshold, nonBusinessDates) === dueDate);
}

// --- Payload / matter label -----------------------------------------------

/**
 * Human-readable matter label for both the e-mail body and the in-app
 * payload (story 31 / Part A.1's "human-readable 'matter' label"): client
 * name + catalog item name when both are present, falling back to the
 * matter's own free-text `description`, and finally to a bare
 * "Processo (<uf>)" placeholder — covers a `rascunho` matter with a null
 * client/catalog item (spec: "handle the null case gracefully anyway", even
 * though a deadline probably shouldn't exist against a fully-empty rascunho
 * matter in practice).
 */
export function buildMatterLabel(row: CandidateDeadlineRow): string {
  if (row.client_name && row.catalog_item_name) {
    return `${row.client_name} — ${row.catalog_item_name}`;
  }
  return row.matter_description ?? `Processo (${row.uf})`;
}

function buildPayload(row: CandidateDeadlineRow): NotificationPayload {
  return {
    matterLabel: buildMatterLabel(row),
    description: row.description,
    dueDate: row.due_date,
  };
}

// --- Orchestration ---------------------------------------------------------

export interface AlertsDeps {
  /** Direct Postgres connection — see repository.ts's module comment for why PostgREST isn't used here. */
  db: Pool;
  /** Injectable Resend HTTP boundary — real implementation is
   * repository.ts's `sendAlertEmailViaResend` (index.ts wires it up with
   * the API key/from address); tests stub this directly, same seam as
   * deadlines-holiday-sync/service.ts's `SyncDeps.fetchHolidays`. */
  sendEmail: (input: SendEmailInput) => Promise<void>;
  /** Overridable "today" (`YYYY-MM-DD`) — tests pin this to a fixture date
   * so threshold detection is deterministic regardless of when the suite
   * actually runs. Defaults to the real current date for production. */
  today?: string;
}

/**
 * How far forward the candidate scan looks for a `pendente` deadline's
 * `due_date` (Part A.1). Needs to comfortably contain any `due_date` that's
 * exactly 5 or 1 *business* days from today even when weekends/holidays
 * stretch that out — the widest realistic stretch in this codebase's own
 * domain data is the national forensic recess (CNJ Resolução 244/2016,
 * year-end, roughly Dec 20 - Jan 20 — about 32 calendar days): if "today"
 * lands right before a recess like that, the 5th business day afterward
 * could be ~32 (recess) + ~7 (5 business days, weekends included) ≈ 39
 * calendar days out. 40 rounds that up with a little slack, while staying
 * bounded (never scans the whole `deadlines` table) — a deliberately more
 * generous number than the ticket's own "e.g. 20" suggestion, specifically
 * because 20 days is narrower than a single real recess period this
 * codebase already models (forensic_holidays), and undercounting here would
 * silently mean a threshold near a recess boundary just never fires.
 */
export const CANDIDATE_WINDOW_DAYS = 40;

export interface RunSummary {
  candidatesScanned: number;
  /** Count of (deadline, threshold) pairs that fired this run — not the
   * same as notificationsCreated, since a rerun can fire the same pair
   * again while inserting zero new rows (dedup, story 28). */
  thresholdsFired: number;
  notificationsCreated: number;
  emailsSent: number;
  emailsFailed: number;
}

function todayIso(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Full scan-detect-insert-send pipeline (Part A.6's `index.ts` calls this
 * directly). Per-recipient email-send failures are isolated (Part A.5) —
 * they never abort the run or count against `notificationsCreated`, which
 * already reflects DB state regardless of send outcome.
 */
export async function runDeadlineAlerts(deps: AlertsDeps): Promise<RunSummary> {
  const today = deps.today ?? todayIso();
  const windowEnd = addCalendarDays(today, CANDIDATE_WINDOW_DAYS);

  const candidates = await repo.fetchCandidateDeadlines(deps.db, today, windowEnd);

  const toInsert: repo.NotificationInsert[] = [];
  let thresholdsFired = 0;
  // Cached per tenant — a run scanning many deadlines for the same tenant
  // shouldn't re-query `users` once per deadline.
  const recipientsByTenant = new Map<string, repo.RecipientRow[]>();

  for (const candidate of candidates) {
    // `[today, due_date]` is always enough for detectFiringThresholds's
    // purposes even though businessDaysForward could in principle walk past
    // due_date — see detectFiringThresholds's doc comment.
    const nonBusinessDates = await repo.resolveNonBusinessDates(deps.db, candidate.uf, today, candidate.due_date);
    const firing = detectFiringThresholds(today, candidate.due_date, nonBusinessDates);
    if (firing.length === 0) continue;

    let recipients = recipientsByTenant.get(candidate.tenant_id);
    if (recipients === undefined) {
      recipients = await repo.fetchTenantRecipients(deps.db, candidate.tenant_id);
      recipientsByTenant.set(candidate.tenant_id, recipients);
    }

    const payload = buildPayload(candidate);

    for (const threshold of firing) {
      thresholdsFired++;
      for (const recipient of recipients) {
        for (const channel of ["email", "in_app"] as const) {
          toInsert.push({
            tenantId: candidate.tenant_id,
            recipientUserId: recipient.id,
            channel,
            category: "deadline_alert",
            deadlineId: candidate.id,
            threshold: THRESHOLD_LABELS[threshold],
            payload,
          });
        }
      }
    }
  }

  const inserted = await repo.insertNotifications(deps.db, toInsert);

  // Only newly-inserted `email` rows get an actual email sent (story 28:
  // exactly-once even on rerun/overlap) — a conflicting (already-existing)
  // row never comes back from insertNotifications's RETURNING at all.
  const emailRows = inserted.filter((row) => row.channel === "email");
  const summary = await sendEmails(deps, emailRows);

  return {
    candidatesScanned: candidates.length,
    thresholdsFired,
    notificationsCreated: inserted.length,
    emailsSent: summary.sent,
    emailsFailed: summary.failed,
  };
}

async function sendEmails(
  deps: AlertsDeps,
  emailRows: InsertedNotification[],
): Promise<{ sent: number; failed: number }> {
  if (emailRows.length === 0) return { sent: 0, failed: 0 };

  const recipientIds = [...new Set(emailRows.map((row) => row.recipient_user_id))];
  const emailByUserId = await repo.fetchUserEmailsByIds(deps.db, recipientIds);

  let sent = 0;
  let failed = 0;

  // Per-row try/catch — one recipient's send failure (bad address, Resend
  // outage, etc.) never aborts the rest of the batch, same "one failure
  // doesn't sink the batch" principle deadlines-holiday-sync uses for
  // per-jurisdiction failures.
  for (const row of emailRows) {
    try {
      const to = emailByUserId.get(row.recipient_user_id);
      if (!to) throw new Error(`No email on file for user ${row.recipient_user_id}`);

      await deps.sendEmail({ to, payload: row.payload });
      await repo.markNotificationSent(deps.db, row.id);
      sent++;
    } catch (error) {
      console.error(`deadlines-alerts: failed to send email for notification ${row.id}`, error);
      await repo.markNotificationFailed(deps.db, row.id);
      failed++;
    }
  }

  return { sent, failed };
}
