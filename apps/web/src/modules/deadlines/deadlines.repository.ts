import type { z } from "zod";
import { supabase } from "@/lib/supabase";
import type { createDeadlineInputSchema, updateDeadlineInputSchema } from "./deadlines.schema";

interface CivilHolidayRow {
  date: string;
}

interface ForensicHolidayRow {
  start_date: string;
  end_date: string;
}

const MS_PER_DAY = 86_400_000;

/** Local, UTC-anchored "add one day" for expanding a recess range into
 * individual dates. Kept self-contained rather than imported from
 * deadlines.service.ts so this file stays a one-directional DB-facing leaf
 * with no dependency on the engine (spec: repository resolves holidays and
 * *hands* the result to the service, never the reverse). */
function nextIsoDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day) + MS_PER_DAY);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Resolves every non-business calendar *date* contributed by holiday
 * sources — national + `uf` civil holidays, and the (national-only, MVP)
 * forensic-recess range(s) — that fall inside `[from, to]`. Weekends are
 * deliberately NOT included here: deadlines.service.ts's pure engine
 * derives those itself from the date alone, so this function is holiday-
 * *source* resolution only (Implementation Decisions: "Weekend skipping is
 * computed in the pure function itself, not stored anywhere").
 *
 * `from`/`to` are caller-supplied rather than assumed — a deadline's due
 * date can run arbitrarily far into the future, so there's no safe
 * hardcoded window. The caller (ticket 03's create/edit flow) is expected
 * to pick something generous relative to a naive worst-case estimate (e.g.
 * `start_date` + N calendar days + a buffer for holiday pushback) before
 * calling this.
 */
export async function resolveNonBusinessDates(uf: string, from: string, to: string): Promise<Set<string>> {
  const [civilResult, forensicResult] = await Promise.all([
    supabase
      .from("civil_holidays")
      .select("date")
      .or(`uf.is.null,uf.eq.${uf}`)
      .gte("date", from)
      .lte("date", to)
      .returns<CivilHolidayRow[]>(),
    // Range overlap test: a recess row is relevant whenever it starts on or
    // before `to` and ends on or after `from` — no `uf` filter, forensic
    // recess is national-only for MVP (Implementation Decisions).
    supabase
      .from("forensic_holidays")
      .select("start_date, end_date")
      .lte("start_date", to)
      .gte("end_date", from)
      .returns<ForensicHolidayRow[]>(),
  ]);

  if (civilResult.error) throw civilResult.error;
  if (forensicResult.error) throw forensicResult.error;

  const dates = new Set<string>();
  for (const row of civilResult.data ?? []) dates.add(row.date);

  // Expand each recess range into its individual dates, clipped to
  // [from, to]. A `Set` absorbs a civil holiday that also falls inside a
  // recess range (e.g. Christmas inside the year-end recess) for free — no
  // double-counting, no special-casing needed.
  for (const row of forensicResult.data ?? []) {
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

// --- Deadline CRUD (ticket 03) — this file remains the only place querying
// `deadlines` directly, alongside the holiday resolution above; it stays a
// one-directional DB-facing leaf (no import of deadlines.service.ts).

// The already-`.parse()`d shape (service.ts's job, never this file's) —
// mirrors matters.repository.ts's ParsedCreateMatter/ParsedMatterPatch.
type ParsedCreateDeadline = z.output<typeof createDeadlineInputSchema>;
type ParsedDeadlinePatch = z.output<typeof updateDeadlineInputSchema>;

interface DeadlineRow {
  id: string;
  matter_id: string;
  is_fatal: boolean;
  counting_mode: string;
  days: number;
  start_date: string;
  description: string;
  status: string;
  due_date: string;
  created_at: string;
  updated_at: string;
}

const DEADLINE_SELECT_COLUMNS =
  "id, matter_id, is_fatal, counting_mode, days, start_date, description, status, due_date, created_at, updated_at";

/** Insert carries `tenant_id` explicitly — RLS's `with check` compares it
 * against `current_tenant_id()` but PostgREST never fills it in for us.
 * `dueDate` is computed by deadlines.service.ts's engine before this is
 * called — this file just persists whatever it's given, same division of
 * labor matters.repository.ts has with matters.service.ts's
 * rascunho-invariant check. */
export async function insertDeadline(tenantId: string, input: ParsedCreateDeadline, dueDate: string) {
  return supabase
    .from("deadlines")
    .insert({
      tenant_id: tenantId,
      matter_id: input.matterId,
      is_fatal: input.isFatal,
      counting_mode: input.countingMode,
      days: input.days,
      start_date: input.startDate,
      description: input.description,
      due_date: dueDate,
    })
    .select(DEADLINE_SELECT_COLUMNS)
    .single<DeadlineRow>();
}

/** Only the fields actually present in `input` are sent — mirrors
 * matters.repository.ts's `updateMatter` exactly: only set keys that are
 * `!== undefined`, so an omitted field is left untouched. `dueDate` is
 * likewise only sent when the service actually recomputed it (a patch that
 * doesn't touch a due-date-affecting field passes `undefined` here). */
export async function updateDeadline(id: string, input: ParsedDeadlinePatch, dueDate: string | undefined) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.matterId !== undefined) patch.matter_id = input.matterId;
  if (input.isFatal !== undefined) patch.is_fatal = input.isFatal;
  if (input.countingMode !== undefined) patch.counting_mode = input.countingMode;
  if (input.days !== undefined) patch.days = input.days;
  if (input.startDate !== undefined) patch.start_date = input.startDate;
  if (input.description !== undefined) patch.description = input.description;
  if (dueDate !== undefined) patch.due_date = dueDate;

  return supabase.from("deadlines").update(patch).eq("id", id).select(DEADLINE_SELECT_COLUMNS).single<DeadlineRow>();
}

/** One-directional status write (story 6) — no toggle-back in this ticket's
 * scope, unlike payments.repository.ts's updatePaymentStatus which accepts
 * either target status. */
export async function markDeadlineCumprido(id: string) {
  return supabase
    .from("deadlines")
    .update({ status: "cumprido", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(DEADLINE_SELECT_COLUMNS)
    .single<DeadlineRow>();
}

/** No `deleted_at` filter — unlike matters/clients, `deadlines` has no
 * soft-delete concept (confirmed against packages/db/src/schema.ts). */
export async function fetchDeadlineById(id: string) {
  return supabase.from("deadlines").select(DEADLINE_SELECT_COLUMNS).eq("id", id).maybeSingle<DeadlineRow>();
}

export interface ListDeadlinesParams {
  matterId?: string;
  status?: string;
}

/** Mirrors matters.repository.ts's `listMatters` structure, minus the
 * search bit — this ticket only asks for matter+status filters. */
export async function listDeadlines({ matterId, status }: ListDeadlinesParams) {
  let query = supabase.from("deadlines").select(DEADLINE_SELECT_COLUMNS).order("created_at", { ascending: false });

  if (matterId) query = query.eq("matter_id", matterId);
  if (status) query = query.eq("status", status);

  return query.returns<DeadlineRow[]>();
}

export type { DeadlineRow };
