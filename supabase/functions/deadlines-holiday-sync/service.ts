// Business logic for the civil-holiday sync Edge Function — the seam under
// test. Typed `deps` (injectable Postgres pool + the FeriadosAPI HTTP
// boundary), no Deno-specific globals, same convention as
// supabase/functions/tenants/service.ts.
import type { Pool } from "pg";
import { ALL_UFS, upsertCivilHolidays, type HolidayRecord, type Jurisdiction, type Uf } from "./repository.ts";

export interface SyncDeps {
  /** Direct Postgres connection — see repository.ts's upsertCivilHolidays doc comment for why PostgREST isn't used here. */
  db: Pool;
  /**
   * Injectable FeriadosAPI HTTP boundary. The real implementation is
   * repository.ts's `fetchHolidaysFromFeriadosApi` (index.ts wires it up
   * with the API key); tests stub this directly instead of mocking `fetch`,
   * same seam as tenants/service.ts's `InviteDeps.authAdmin`.
   */
  fetchHolidays: (jurisdiction: Jurisdiction, year: number) => Promise<HolidayRecord[]>;
}

interface JurisdictionYear {
  uf: Uf | null;
  year: number;
}

export interface JurisdictionSuccess extends JurisdictionYear {
  upserted: number;
}

export interface JurisdictionFailure extends JurisdictionYear {
  error: string;
}

export interface SyncSummary {
  results: JurisdictionSuccess[];
  failures: JurisdictionFailure[];
  totalUpserted: number;
}

export interface SyncOptions {
  /**
   * Calendar years to sync. Defaults to [this year, next year]: a
   * `dias_uteis` count started in December can roll into January, so next
   * year's holidays need to already be cached before the year turns rather
   * than first appearing on next month's run. Overridable — tests pass a
   * single fixture year to keep fixtures small and deterministic.
   */
  years?: number[];
}

function defaultYears(): number[] {
  const currentYear = new Date().getFullYear();
  return [currentYear, currentYear + 1];
}

/**
 * Syncs national + all 27 UFs' civil holidays into `civil_holidays`, one
 * (jurisdiction, year) pair at a time.
 *
 * Failure isolation (story 18): a single (jurisdiction, year) fetch failing
 * is caught, logged, and recorded in `failures` — it does NOT abort the
 * rest of the run. A transient per-jurisdiction failure (one UF's API call
 * timing out, say) is more likely than a total FeriadosAPI outage, so the
 * other 26 UFs' + national's data shouldn't go stale for a month just
 * because one call failed. Nothing in this loop (or in
 * repository.ts's upsertCivilHolidays) ever issues a DELETE, so every
 * jurisdiction/year that isn't touched this run — whether skipped by a
 * caught error or simply not yet reached — keeps its existing rows exactly
 * as they were.
 */
export async function syncCivilHolidays(deps: SyncDeps, options: SyncOptions = {}): Promise<SyncSummary> {
  const years = options.years ?? defaultYears();
  const jurisdictions: Jurisdiction[] = [{ uf: null }, ...ALL_UFS.map((uf) => ({ uf }))];

  const results: JurisdictionSuccess[] = [];
  const failures: JurisdictionFailure[] = [];

  for (const year of years) {
    for (const jurisdiction of jurisdictions) {
      try {
        const records = await deps.fetchHolidays(jurisdiction, year);
        const upserted = await upsertCivilHolidays(deps.db, records);
        results.push({ uf: jurisdiction.uf, year, upserted });
      } catch (error) {
        console.error(
          `deadlines-holiday-sync: failed for uf=${jurisdiction.uf ?? "nacional"} year=${year}`,
          error,
        );
        failures.push({
          uf: jurisdiction.uf,
          year,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    results,
    failures,
    totalUpserted: results.reduce((sum, result) => sum + result.upserted, 0),
  };
}
