import { Client, Pool } from "pg";

// Default is the fixed local-dev demo value `supabase init` bakes into
// every project's config.toml — not a secret, just enough for `pnpm test`
// to work against a `supabase start`'d stack with zero env setup. Override
// via env for CI/a differently-configured stack. Same value as
// tenants/test/harness.ts's DB_URL.
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

// Direct Postgres, not a supabase-js client — see repository.ts's
// upsertCivilHolidays doc comment for why this function (production code
// and its tests alike) talks to Postgres directly rather than through
// PostgREST. No GoTrue/auth user seeding needed here either (unlike
// tenants/test/harness.ts) — this function never authenticates end users.
export const db = new Pool({ connectionString: DB_URL });

/**
 * Verifies the stack this suite needs is actually reachable before any test
 * runs. Uses its own short-lived connection, never the module-level `db`
 * Pool above — vitest's `globalSetup` runs in a separate process from test
 * files, so that Pool belongs to a different instance of this module
 * entirely (same reasoning as tenants/test/harness.ts).
 */
export async function assertStackReachable(): Promise<void> {
  const client = new Client({ connectionString: DB_URL });
  try {
    await client.connect();
    await client.query("select 1");
  } catch (error) {
    throw new Error(`Can't reach Postgres at ${DB_URL} — run \`supabase start\` for this project first.`, {
      cause: error,
    });
  } finally {
    await client.end().catch(() => {});
  }
}

export interface HolidayRow {
  id: string;
  date: string;
  uf: string | null;
  name: string;
}

/**
 * Seeds one `civil_holidays` row directly, bypassing the sync job entirely
 * — used to set up "pre-existing rows must survive a failed run" fixtures
 * (story 18). `date` is cast back to text on the way out (`to_char`) so
 * callers compare plain `YYYY-MM-DD` strings rather than node-postgres's
 * default `Date` object parsing for the `date` OID.
 */
export async function seedHoliday(record: { date: string; uf: string | null; name: string }): Promise<HolidayRow> {
  const { rows } = await db.query<HolidayRow>(
    `insert into public.civil_holidays (date, uf, name)
     values ($1, $2, $3)
     returning id, to_char(date, 'YYYY-MM-DD') as date, uf, name`,
    [record.date, record.uf, record.name],
  );
  return rows[0]!;
}

/** Reads back rows for a known set of fixture dates, for before/after comparison. */
export async function fetchHolidaysByDates(dates: string[]): Promise<HolidayRow[]> {
  const { rows } = await db.query<HolidayRow>(
    `select id, to_char(date, 'YYYY-MM-DD') as date, uf, name
     from public.civil_holidays
     where date = any($1::date[])
     order by date asc, uf asc nulls first`,
    [dates],
  );
  return rows;
}

/** Test cleanup — deletes only the fixture rows a test created, by their known dates. */
export async function deleteHolidaysByDates(dates: string[]): Promise<void> {
  await db.query("delete from public.civil_holidays where date = any($1::date[])", [dates]);
}

export async function closeHarness(): Promise<void> {
  await db.end();
}
