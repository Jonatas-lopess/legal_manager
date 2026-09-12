// The engine seam (spec's Implementation Decisions, "Engine seam"):
// computeDueDate and its private helpers below must never import
// supabase-js or deadlines.repository.ts. Everything through the end of
// that section is pure date arithmetic — deterministic, offline-testable,
// no I/O — so it can be exhaustively unit-tested without a database or
// network call (story 15).
//
// Ticket 03 (deadlines CRUD) adds a second section further down that *does*
// import deadlines.repository.ts and ../matters/matters.controller — that's
// expected orchestration around the pure engine (parse input, resolve the
// due date by calling computeDueDate, persist via the repository), not a
// change to the engine itself. This comment originally read "this file must
// never import..." without that distinction; narrowed here since ticket 03
// legitimately needs I/O in the CRUD functions.

import { createDeadlineInputSchema, updateDeadlineInputSchema } from "./deadlines.schema";
import type {
  Deadline,
  CreateDeadlineInput,
  UpdateDeadlineInput,
  DeadlineStatus,
  ListDeadlinesFilter,
} from "./deadlines.schema";
import * as repo from "./deadlines.repository";
import type { DeadlineRow } from "./deadlines.repository";
import { getCurrentUser } from "../tenants/tenants.controller";
import { getMatter } from "../matters/matters.controller";

export type CountingMode = "dias_uteis" | "dias_corridos";

const MS_PER_DAY = 86_400_000;

/** Parses a `YYYY-MM-DD` string into a UTC-anchored instant. Never
 * `new Date(iso)` followed by local getters/setters — that's the classic
 * off-by-one-day bug when the machine's local timezone isn't UTC. Every
 * helper below stays on this UTC rail end to end. */
function toUtcMs(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function toIsoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function addCalendarDays(iso: string, days: number): string {
  return toIsoDate(toUtcMs(iso) + days * MS_PER_DAY);
}

/** Sunday = 0 / Saturday = 6, read via the UTC getter so it never drifts
 * with the runtime's local timezone (see toUtcMs). */
function isWeekend(iso: string): boolean {
  const day = new Date(toUtcMs(iso)).getUTCDay();
  return day === 0 || day === 6;
}

function isBusinessDay(iso: string, nonBusinessDates: Set<string>): boolean {
  return !isWeekend(iso) && !nonBusinessDates.has(iso);
}

/** Walks forward — possibly through several consecutive non-business dates
 * (a holiday next to a weekend, a multi-day recess) — until it lands on a
 * business day. Used to find where dias_uteis counting actually starts
 * (story 14: a non-business start_date defers to the next business day). */
function nextBusinessDay(iso: string, nonBusinessDates: Set<string>): string {
  let cursor = iso;
  while (!isBusinessDay(cursor, nonBusinessDates)) {
    cursor = addCalendarDays(cursor, 1);
  }
  return cursor;
}

/**
 * Pure due-date arithmetic — the engine's unit under test (spec: "a pure
 * function of (start_date, counting_mode, holiday set) with no I/O").
 * `nonBusinessDates` is whatever deadlines.repository.ts's
 * `resolveNonBusinessDates` already resolved for the matter's `uf` (or any
 * fixture set in tests) — this function has no opinion on *why* a date is
 * in the set, only that it is.
 *
 * `days` isn't named in the spec's stated `(start_date, counting_mode,
 * holiday set)` signature, but a day *count* has to come from somewhere — a
 * real prazo is "15 dias úteis para contestação", not an unparameterized
 * constant — and no such column exists yet on `deadlines` as of this
 * ticket (checked packages/db/src/schema.ts and both `postgres-schema-rls`/
 * 03 and this feature's own ticket 03 — neither mentions one). Flagged as a
 * spec gap in this ticket's report; ticket 03 will need to add the column
 * and a form field. Taking `days` as an explicit parameter here is the
 * least-surprising reading of "due date is a plain calendar-day count from
 * start_date" that keeps this function usable once that lands.
 *
 * - `dias_corridos` (story 8): `start_date + days` calendar days, full
 *   stop — no weekend/holiday awareness at all, not even for adjusting a
 *   non-business start_date ("ignoring weekends and holidays entirely").
 * - `dias_uteis`: counting starts at the first business day at/after
 *   `start_date` (story 14) — that start date itself is excluded from the
 *   count (CPC art. 224's "exclui-se o dia do começo"), matching how a real
 *   prazo's "dia do começo" works. From there, walk forward one calendar
 *   day at a time, counting a day toward `days` only when it's a business
 *   day (not a weekend, not in `nonBusinessDates`). The date the loop lands
 *   on once the count is satisfied is, by construction, always a business
 *   day — exactly what "a computed due date rolls forward past a
 *   non-business day" (story 13) asks for, so no separate rollforward pass
 *   is needed on top of the counting loop itself.
 */
export function computeDueDate(
  startDate: string,
  days: number,
  countingMode: CountingMode,
  nonBusinessDates: Set<string> | string[],
): string {
  if (countingMode === "dias_corridos") {
    return addCalendarDays(startDate, days);
  }

  const nonBusinessSet = nonBusinessDates instanceof Set ? nonBusinessDates : new Set(nonBusinessDates);

  let cursor = nextBusinessDay(startDate, nonBusinessSet);
  let remaining = days;
  while (remaining > 0) {
    cursor = addCalendarDays(cursor, 1);
    if (isBusinessDay(cursor, nonBusinessSet)) remaining--;
  }
  return cursor;
}

// --- CRUD orchestration (ticket 03) — everything below composes the pure
// engine above with I/O (matters.controller for `uf`, deadlines.repository
// for both holiday resolution and persistence). Mirrors matters.service.ts's
// shape: parse -> resolve tenant/derived data -> repo call -> map to domain.

function toDeadline(row: DeadlineRow): Deadline {
  return {
    id: row.id,
    matterId: row.matter_id,
    isFatal: row.is_fatal,
    countingMode: row.counting_mode as CountingMode,
    days: row.days,
    startDate: row.start_date,
    description: row.description,
    status: row.status as DeadlineStatus,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Resolves `due_date` for a create/edit. The matter's `uf` is read through
 * `../matters/matters.controller` — the module's real public boundary
 * (confirmed against eslint.config.ts's eslint-plugin-boundaries rules,
 * which only block cross-module imports of `*.{repository,service}.ts`;
 * `.controller.ts`-to-`.controller.ts` is unrestricted). The spec's own
 * Implementation Decisions wording ("calling matters.service.ts's public
 * interface") doesn't match how every other cross-module read in this
 * codebase actually works — see this ticket's brief for the full
 * correction.
 *
 * `dias_corridos` skips the holiday round trip entirely: computeDueDate
 * ignores `nonBusinessDates` for that mode, so there's nothing for
 * resolveNonBusinessDates to contribute.
 */
async function resolveDueDate(
  matterId: string,
  startDate: string,
  days: number,
  countingMode: CountingMode,
): Promise<string> {
  if (countingMode === "dias_corridos") {
    return computeDueDate(startDate, days, countingMode, []);
  }

  const matter = await getMatter(matterId);
  if (!matter) throw new Error("Processo não encontrado.");

  // Generous, documented upper bound for the holiday-resolution window
  // (resolveNonBusinessDates's own doc comment asks the caller to pick
  // something generous relative to a naive worst-case estimate): worst
  // case, every other calendar day is a holiday, so `days * 3` calendar
  // days comfortably covers the business days actually needed even under
  // heavy holiday pushback, plus a flat 30-day buffer in case a
  // forensic-recess stretch lands right at the window's edge.
  const upperBound = addCalendarDays(startDate, days * 3 + 30);
  const nonBusinessDates = await repo.resolveNonBusinessDates(matter.uf, startDate, upperBound);
  return computeDueDate(startDate, days, countingMode, nonBusinessDates);
}

/** Insert carries `tenant_id` explicitly — RLS's `with check` compares it
 * against `current_tenant_id()` but PostgREST never fills it in for us. No
 * role check: PLANNING §8's matrix gives all three roles full `deadlines`
 * CRUD (confirmed by this ticket's own checklist, "no role check rejects
 * any deadline action") — unlike payments.service.ts's
 * `requireNonSecretario`, which would be wrong here. */
export async function createDeadline(input: CreateDeadlineInput): Promise<Deadline> {
  const parsed = createDeadlineInputSchema.parse(input);

  const user = await getCurrentUser();
  if (!user) throw new Error("Não autenticado.");

  const dueDate = await resolveDueDate(parsed.matterId, parsed.startDate, parsed.days, parsed.countingMode);

  const { data, error } = await repo.insertDeadline(user.tenantId, parsed, dueDate);
  if (error || !data) throw error ?? new Error("Falha ao criar prazo.");
  return toDeadline(data);
}

// Fields that feed resolveDueDate — a patch touching any of these needs a
// recomputed `due_date`; a patch touching only `description`/`isFatal`
// doesn't, so it skips the round trip entirely.
const DUE_DATE_AFFECTING_FIELDS = ["matterId", "startDate", "days", "countingMode"] as const;

/** Recomputes `due_date` only when the patch actually touches a field that
 * affects it (story 5), merging patch-over-current so an edit to just one
 * of the four fields still resolves against the row's existing values for
 * the others. */
export async function updateDeadline(id: string, input: UpdateDeadlineInput): Promise<Deadline> {
  const parsed = updateDeadlineInputSchema.parse(input);

  const touchesDueDate = DUE_DATE_AFFECTING_FIELDS.some((field) => parsed[field] !== undefined);

  let dueDate: string | undefined;
  if (touchesDueDate) {
    const { data: current, error: fetchError } = await repo.fetchDeadlineById(id);
    if (fetchError) throw fetchError;
    if (!current) throw new Error("Prazo não encontrado.");

    const matterId = parsed.matterId ?? current.matter_id;
    const startDate = parsed.startDate ?? current.start_date;
    const days = parsed.days ?? current.days;
    const countingMode = (parsed.countingMode ?? current.counting_mode) as CountingMode;

    dueDate = await resolveDueDate(matterId, startDate, days, countingMode);
  }

  const { data, error } = await repo.updateDeadline(id, parsed, dueDate);
  if (error || !data) throw error ?? new Error("Falha ao atualizar prazo.");
  return toDeadline(data);
}

/** One-directional (story 6 only asks for marking cumprido, not un-marking)
 * — mirrors payments.service.ts's togglePaymentStatus shape without the
 * toggle-back. */
export async function markDeadlineCumprido(id: string): Promise<Deadline> {
  const { data, error } = await repo.markDeadlineCumprido(id);
  if (error || !data) throw error ?? new Error("Falha ao marcar prazo como cumprido.");
  return toDeadline(data);
}

/** Resolves by id — see deadlines.repository (no soft-delete on this table,
 * so unlike matters.service.ts's getMatter there's no deleted-row caveat to
 * note here). */
export async function getDeadline(id: string): Promise<Deadline | null> {
  const { data, error } = await repo.fetchDeadlineById(id);
  if (error) throw error;
  return data ? toDeadline(data) : null;
}

/** RLS scopes this to the caller's own tenant — see deadlines.repository. */
export async function listDeadlines(filter: ListDeadlinesFilter = {}): Promise<Deadline[]> {
  const { data, error } = await repo.listDeadlines(filter);
  if (error) throw error;
  return (data ?? []).map(toDeadline);
}

// --- Vencido/vence-em-breve heuristic — originally private to
// DeadlinesTable.tsx, moved here (unchanged) so dashboard-reports can call
// the exact same comparison instead of reimplementing it (that feature's
// spec: "no separate report query"). Deliberately a plain local-date string
// comparison, distinct from computeDueDate's UTC business-day precision
// above — a lightweight heuristic for listing/report display, not a due-
// date computation.

export type DueDateHighlight = "vencido" | "vence_em_breve" | "on_track";

function todayLocalIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function addLocalCalendarDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const d = new Date(year, month - 1, day + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A `cumprido` deadline is always "on_track" — once satisfied, overdue/
 * vence-em-breve triage no longer applies to it (judgment call — the spec
 * doesn't say either way). Otherwise: strictly past due -> "vencido"; due
 * today through 5 calendar days out -> "vence_em_breve"; further out ->
 * "on_track". */
export function dueDateHighlight(dueDate: string, status: DeadlineStatus): DueDateHighlight {
  if (status === "cumprido") return "on_track";
  const today = todayLocalIso();
  if (dueDate < today) return "vencido";
  if (dueDate <= addLocalCalendarDays(today, 5)) return "vence_em_breve";
  return "on_track";
}

// --- Vencido/hoje/próximos bucketing — moved here (ui-shell-clientes-casos-
// config/03, spec.md fidelity check point 9) from reports.service.ts's
// getPrazosCriticos, which had this exact grouping private to itself
// (dashboard-reports' own code-review flagged that as duplicated date-
// arithmetic that belonged in this module). Callers: reports.service.ts's
// getPrazosCriticos (no matterId — every pendente deadline in the tenant)
// and casos-detalhe's new matter-scoped Prazos card (matterId set). Kept as
// one shared function rather than reimplemented a third time.

export interface PrazoBucketDeadline extends Deadline {
  /** Always "vencido" or "vence_em_breve" — on_track rows are filtered out
   * before bucketing (see below), so this union member is unreachable here,
   * but kept as DueDateHighlight (not a 2-value subtype) so callers can pass
   * it straight through without a cast. */
  highlight: DueDateHighlight;
}

export interface PrazoBuckets {
  count: number;
  groups: {
    vencido: PrazoBucketDeadline[];
    hoje: PrazoBucketDeadline[];
    proximos: PrazoBucketDeadline[];
  };
}

/**
 * Headline count + vencido/hoje/próximos grouping shared by reports'
 * Prazos-críticos aggregate and the matter-scoped Prazos card. Pulls every
 * `pendente` deadline (optionally scoped to a single matter via `matterId`
 * — `listDeadlines`'s existing `ListDeadlinesFilter.matterId`, no new query),
 * keeps only the ones `dueDateHighlight` doesn't call "on_track" (folds
 * "already overdue" and "due within 5 dias" into vencido/vence_em_breve),
 * then splits that filtered set by a plain local-date-string comparison
 * against today — same today/comparison rail as `dueDateHighlight` itself
 * (not computeDueDate's UTC business-day precision).
 */
export async function getPrazoBuckets(matterId?: string): Promise<PrazoBuckets> {
  const deadlines = await listDeadlines({ status: "pendente", matterId });
  const today = todayLocalIso();
  const groups: PrazoBuckets["groups"] = { vencido: [], hoje: [], proximos: [] };
  let count = 0;

  for (const deadline of deadlines) {
    const highlight = dueDateHighlight(deadline.dueDate, deadline.status);
    if (highlight === "on_track") continue;

    count++;
    const row: PrazoBucketDeadline = { ...deadline, highlight };
    if (deadline.dueDate < today) groups.vencido.push(row);
    else if (deadline.dueDate === today) groups.hoje.push(row);
    else groups.proximos.push(row);
  }

  return { count, groups };
}
