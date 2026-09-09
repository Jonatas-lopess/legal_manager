// Low-level IO for the civil-holiday sync Edge Function. Plain TS (no Deno
// globals) so it loads unmodified under both the Deno edge runtime (via
// this function's deno.json) and Node/vitest (via this package's own
// node_modules) — same convention as
// supabase/functions/tenants/repository.ts.
import type { Pool } from "pg";

// No canonical list of the 27 Brazilian UF codes exists anywhere else in
// this repo (packages/schema's `createMatterInputSchema.uf` only
// regex-validates "any two uppercase letters" for a matter's own free-text
// uf field) — this sync job owns its own source of truth for "all 27 UFs"
// per the ticket.
export const ALL_UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
] as const;
export type Uf = (typeof ALL_UFS)[number];

/** `uf: null` means the national jurisdiction — mirrors `civil_holidays.uf`. */
export interface Jurisdiction {
  uf: Uf | null;
}

export interface HolidayRecord {
  /** ISO 8601 `YYYY-MM-DD`, matching `civil_holidays.date`'s Postgres `date` column. */
  date: string;
  uf: Uf | null;
  name: string;
}

// ---------------------------------------------------------------------------
// FeriadosAPI HTTP boundary
//
// GUESSED FROM PUBLIC DOCS (https://feriadosapi.com/docs, fetched 2026-09-09
// via WebFetch — no live account/API key was available while building this
// ticket) — NOT verified against a real request/response. Base URL, endpoint
// paths, query params, the response envelope shape, the `DD/MM/YYYY` date
// format, and the `Authorization: Bearer <key>` auth header all come from
// that one fetch and could be wrong or stale by the time this ships.
// Deliberately isolated in the functions below (per the ticket) so a wire-
// format mismatch against the real API is a one-function fix — the rest of
// this module (upsert/idempotency/failure-isolation) only depends on
// already-normalized `HolidayRecord[]`, which is what the test suite
// exercises. VERIFY THIS BLOCK against real FeriadosAPI docs + a real API
// key before relying on it in production.
const FERIADOS_API_BASE_URL = "https://feriadosapi.com/api/v1";

interface FeriadosApiHoliday {
  data: string; // "DD/MM/YYYY" per the docs
  nome: string;
  tipo: "NACIONAL" | "ESTADUAL" | "MUNICIPAL" | "FACULTATIVO";
  uf?: string;
}

interface FeriadosApiResponse {
  feriados: FeriadosApiHoliday[];
}

function feriadosApiUrl(jurisdiction: Jurisdiction, year: number): string {
  // /feriados/nacionais and /feriados/estado/{uf} per the docs; the docs
  // also show a `page`/`limit` pagination pair on the nacionais endpoint —
  // not handled here (a year's national holiday list is small enough to
  // assume it never paginates), flagged for the same reason as the rest of
  // this block.
  return jurisdiction.uf === null
    ? `${FERIADOS_API_BASE_URL}/feriados/nacionais?ano=${year}`
    : `${FERIADOS_API_BASE_URL}/feriados/estado/${jurisdiction.uf}?ano=${year}`;
}

/** "25/12/2026" -> "2026-12-25" (the Postgres `date` literal format). */
function toIsoDate(brDate: string): string {
  const [day, month, year] = brDate.split("/");
  if (!day || !month || !year) {
    throw new Error(`Unrecognized FeriadosAPI date format: "${brDate}" (expected DD/MM/YYYY)`);
  }
  return `${year}-${month}-${day}`;
}

/**
 * Per the docs, `/feriados/estado/{uf}` returns BOTH state and national
 * holidays for that UF — fetching it for all 27 UFs would otherwise
 * re-report every national holiday 27 times. National is already fetched
 * once via its own call (`jurisdiction.uf === null`), so a state-jurisdiction
 * response is filtered down to `tipo === "ESTADUAL"` only, and a national
 * one to `tipo === "NACIONAL"` — this is also what keeps a state holiday
 * from ever being upserted with `uf: null` (national) or vice versa.
 */
function parseFeriadosApiResponse(body: FeriadosApiResponse, jurisdiction: Jurisdiction): HolidayRecord[] {
  const wantedTipo = jurisdiction.uf === null ? "NACIONAL" : "ESTADUAL";
  return body.feriados
    .filter((h) => h.tipo === wantedTipo)
    .map((h) => ({ date: toIsoDate(h.data), uf: jurisdiction.uf, name: h.nome }));
}

/**
 * Real network call to FeriadosAPI for one jurisdiction/year — the
 * production `fetchHolidays` implementation `index.ts` wires up. Tests
 * inject their own stub instead (see service.ts's `SyncDeps`), so this
 * function's correctness against the *real* FeriadosAPI wire format is NOT
 * exercised by this ticket's test suite — see the module-level comment
 * above.
 */
export async function fetchHolidaysFromFeriadosApi(
  apiKey: string,
  jurisdiction: Jurisdiction,
  year: number,
): Promise<HolidayRecord[]> {
  const response = await fetch(feriadosApiUrl(jurisdiction, year), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(
      `FeriadosAPI request failed (${response.status} ${response.statusText}) for uf=${jurisdiction.uf ?? "nacional"} year=${year}`,
    );
  }
  const body = (await response.json()) as FeriadosApiResponse;
  return parseFeriadosApiResponse(body, jurisdiction);
}

// ---------------------------------------------------------------------------
// civil_holidays upsert

/**
 * Upsert-only — never preceded by a DELETE anywhere in this module, so a
 * failed/partial run (a `fetchHolidays` call throwing before this is even
 * reached, see service.ts) can never touch existing rows (story 18).
 * `DO UPDATE SET name = excluded.name` rather than `DO NOTHING`: either
 * satisfies "no duplicate rows" (story 17), but a source-corrected holiday
 * name should actually land on rerun rather than getting silently ignored
 * forever once a `(date, uf)` row exists once.
 *
 * Direct Postgres connection (never PostgREST) — same shape as
 * tenants/repository.ts's fetchCallerMembership/insertTenantMember, but for
 * a different reason than that file's `users` grant gap. This ticket's own
 * brief guessed `service_role` might get an implicit platform-level bypass
 * of table grants the same way it bypasses RLS — checked empirically
 * against this project's real local stack, and that guess was wrong: a
 * `service_role`-keyed supabase-js `.from("civil_holidays").upsert(...)`
 * call returns `permission denied for table civil_holidays` / `GRANT ...
 * TO service_role`. `service_role`'s Postgres role does have
 * `rolbypassrls = true` (confirmed via `pg_roles`), but RLS bypass is
 * irrelevant when the base table GRANT itself is missing — this feature's
 * RLS migration
 * (20260909154725_deadlines-schema-holidays-notifications-rls.sql) only
 * grants `authenticated` SELECT on `civil_holidays`, and `\dp
 * civil_holidays` on the live stack shows `service_role=Dxtm` — TRUNCATE/
 * REFERENCES/TRIGGER/MAINTAIN only, no SELECT/INSERT/UPDATE/DELETE — under
 * this project's `auto_expose_new_tables` default (see
 * supabase/config.toml's [api] comment: "the new cloud default", nothing
 * auto-granted, not even to `service_role`). So this falls back to a
 * `pg.Pool` exactly like tenants does, connecting as the migration-owning
 * `postgres` role, which owns the table outright.
 */
export async function upsertCivilHolidays(db: Pool, records: HolidayRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  // One multi-row INSERT for the whole jurisdiction/year's list rather than
  // one query per holiday. If a single FeriadosAPI response ever contained
  // two rows for the same (date, uf) — a data bug on their end, not
  // something observed — Postgres rejects a same-statement double conflict
  // outright ("ON CONFLICT DO UPDATE command cannot affect row a second
  // time"); that throws here and is caught by service.ts's per-jurisdiction
  // try/catch, same as any other fetch/upsert failure — it never reaches a
  // partial write.
  const values: string[] = [];
  const params: unknown[] = [];
  records.forEach((record, i) => {
    const offset = i * 3;
    values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
    params.push(record.date, record.uf, record.name);
  });

  const { rows } = await db.query<{ id: string }>(
    `insert into public.civil_holidays (date, uf, name)
     values ${values.join(", ")}
     on conflict (date, uf) do update set name = excluded.name
     returning id`,
    params,
  );
  return rows.length;
}
