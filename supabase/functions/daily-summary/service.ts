// Business logic for the daily-summary Edge Function — the seam under test.
// Typed `deps` (injectable Postgres pool, auth client, and the model-call
// boundary, plus an injectable `today` for deterministic tests), no
// Deno-specific globals — same convention as deadlines-alerts/service.ts.
import type { Pool } from "pg";
import * as repo from "./repository.ts";
import type { DeadlineRow } from "./repository.ts";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// --- Matter label (byte-for-byte the same fallback chain as
// deadlines-alerts/service.ts's buildMatterLabel — re-derived rather than
// imported, same "no cross-Edge-Function imports" precedent) ------------

export function buildMatterLabel(row: DeadlineRow): string {
  if (row.client_name && row.catalog_item_name) {
    return `${row.client_name} — ${row.catalog_item_name}`;
  }
  return row.matter_description ?? "Processo sem descrição";
}

// --- Bucketing -----------------------------------------------------------

export interface DeadlineItem {
  matterLabel: string;
  description: string;
  dueDate: string;
  isFatal: boolean;
}

export interface DailySnapshot {
  today: string;
  overdue: DeadlineItem[];
  dueToday: DeadlineItem[];
  dueThisWeek: DeadlineItem[];
  activeMattersCount: number;
}

function toItem(row: DeadlineRow): DeadlineItem {
  return {
    matterLabel: buildMatterLabel(row),
    description: row.description,
    dueDate: row.due_date,
    isFatal: row.is_fatal,
  };
}

/** Splits one `fetchPendingDeadlines` result set into overdue / due-today /
 * due-this-week (today's window end is inclusive, already applied by the
 * query) — plain string comparison since `due_date` stays `YYYY-MM-DD`
 * end to end (ISO lexicographic order matches calendar order). */
export function categorizeDeadlines(rows: DeadlineRow[], today: string): Pick<DailySnapshot, "overdue" | "dueToday" | "dueThisWeek"> {
  const overdue: DeadlineItem[] = [];
  const dueToday: DeadlineItem[] = [];
  const dueThisWeek: DeadlineItem[] = [];

  for (const row of rows) {
    const item = toItem(row);
    if (row.due_date < today) overdue.push(item);
    else if (row.due_date === today) dueToday.push(item);
    else dueThisWeek.push(item);
  }

  return { overdue, dueToday, dueThisWeek };
}

/** No pendente deadline in the scanned window and no active matter — the
 * canned response case in `generateDailySummary` below, so a quiet tenant
 * never pays for a model call that would just restate "nothing going on". */
export function isSnapshotEmpty(snapshot: DailySnapshot): boolean {
  return (
    snapshot.overdue.length === 0 &&
    snapshot.dueToday.length === 0 &&
    snapshot.dueThisWeek.length === 0 &&
    snapshot.activeMattersCount === 0
  );
}

export const EMPTY_SNAPSHOT_SUMMARY =
  "Nenhum prazo pendente ou matter em andamento hoje. Dia livre por enquanto.";

// --- Prompt ----------------------------------------------------------------

const SYSTEM_PROMPT =
  "Você é o assistente do painel de um escritório de advocacia brasileiro. " +
  "Escreva um resumo do dia, em português, curto (um parágrafo mais uma lista " +
  "de destaques quando houver prazos urgentes), com tom direto e profissional. " +
  "Priorize prazos vencidos e prazos fatais primeiro, depois os que vencem hoje, " +
  "depois os da semana. Use somente os dados fornecidos — nunca invente prazo, " +
  "cliente ou matter que não esteja na lista.";

function formatItem(item: DeadlineItem): string {
  const fatalTag = item.isFatal ? " [FATAL]" : "";
  return `- ${item.matterLabel} — ${item.description} (vence ${item.dueDate})${fatalTag}`;
}

/** Pure, no I/O — the prompt's exact wording is what's under test, not the
 * model call itself (that's mocked at the `callModel` boundary, same
 * seam-testing precedent as deadlines-alerts' `sendEmail`). */
export function buildUserPrompt(snapshot: DailySnapshot): string {
  const lines: string[] = [`Data de hoje: ${snapshot.today}`, `Matters em andamento: ${snapshot.activeMattersCount}`];

  lines.push("");
  lines.push(`Prazos vencidos (${snapshot.overdue.length}):`);
  lines.push(...(snapshot.overdue.length > 0 ? snapshot.overdue.map(formatItem) : ["- nenhum"]));

  lines.push("");
  lines.push(`Prazos que vencem hoje (${snapshot.dueToday.length}):`);
  lines.push(...(snapshot.dueToday.length > 0 ? snapshot.dueToday.map(formatItem) : ["- nenhum"]));

  lines.push("");
  lines.push(`Prazos que vencem nos próximos 7 dias (${snapshot.dueThisWeek.length}):`);
  lines.push(...(snapshot.dueThisWeek.length > 0 ? snapshot.dueThisWeek.map(formatItem) : ["- nenhum"]));

  return lines.join("\n");
}

// --- Orchestration -----------------------------------------------------

/** How many calendar days forward `fetchPendingDeadlines`' window scans for
 * "due this week" — a plain 7, unlike deadlines-alerts' business-day
 * threshold math (this feature reads a fixed calendar window, it doesn't
 * detect alert-firing thresholds). */
export const SNAPSHOT_WINDOW_DAYS = 7;

const MS_PER_DAY = 86_400_000;

function todayIso(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function addDaysIso(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day) + days * MS_PER_DAY);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export interface AuthClient {
  auth: {
    getUser(jwt: string): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
}

export interface DailySummaryDeps {
  db: Pool;
  authClient: AuthClient;
  /** Real implementation is repository.ts's `callAnthropic` (index.ts wires
   * up the API key); tests stub this directly, same seam as
   * deadlines-alerts/service.ts's `AlertsDeps.sendEmail`. */
  callModel: (input: { system: string; user: string }) => Promise<string>;
  /** Overridable "today" (`YYYY-MM-DD`) for deterministic tests — defaults to
   * the real current date in production. */
  today?: string;
}

export interface DailySummaryResult {
  summary: string;
  generatedAt: string;
  stats: {
    overdueCount: number;
    dueTodayCount: number;
    dueThisWeekCount: number;
    activeMattersCount: number;
  };
}

/** Full resolve-fetch-build-generate pipeline (index.ts calls this
 * directly). Throws `HttpError` for caller-facing failures (bad/expired JWT,
 * user with no tenant row) — index.ts maps those straight to their status
 * code, same shape as deadlines-alerts/index.ts's catch block. */
export async function generateDailySummary(deps: DailySummaryDeps, jwt: string | null): Promise<DailySummaryResult> {
  if (!jwt) throw new HttpError(401, "Missing Authorization header");

  const tenantId = await repo.resolveTenantIdForUser(deps.authClient, deps.db, jwt);
  if (!tenantId) throw new HttpError(403, "No tenant found for this user");

  const today = deps.today ?? todayIso();
  const windowEnd = addDaysIso(today, SNAPSHOT_WINDOW_DAYS);

  const [rows, activeMattersCount] = await Promise.all([
    repo.fetchPendingDeadlines(deps.db, tenantId, windowEnd),
    repo.fetchActiveMattersCount(deps.db, tenantId),
  ]);

  const snapshot: DailySnapshot = { today, activeMattersCount, ...categorizeDeadlines(rows, today) };

  const stats = {
    overdueCount: snapshot.overdue.length,
    dueTodayCount: snapshot.dueToday.length,
    dueThisWeekCount: snapshot.dueThisWeek.length,
    activeMattersCount: snapshot.activeMattersCount,
  };

  if (isSnapshotEmpty(snapshot)) {
    return { summary: EMPTY_SNAPSHOT_SUMMARY, generatedAt: new Date().toISOString(), stats };
  }

  let summary: string;
  try {
    summary = await deps.callModel({ system: SYSTEM_PROMPT, user: buildUserPrompt(snapshot) });
  } catch (error) {
    // Full error (Groq's raw status/body) goes to the function logs, not the
    // client — index.ts's catch skips its own console.error for HttpError,
    // so this is the only place it gets logged.
    console.error("daily-summary: model call failed", error);
    throw new HttpError(502, "Não foi possível gerar o resumo agora (serviço de IA indisponível). Tente novamente em instantes.");
  }

  return { summary, generatedAt: new Date().toISOString(), stats };
}
