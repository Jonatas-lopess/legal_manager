// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import * as repo from "../deadlines.repository";
import * as tenants from "../../tenants/tenants.controller";
import { assertStackReachable, cleanupAll, closeHarness, db, seedAdmin, seedTenant } from "../../tenants/test/harness";

// civil_holidays/forensic_holidays are global reference tables (no
// tenant_id) — `authenticated` only has SELECT on them (migration
// 20260909154725), no client-facing INSERT, so fixtures are seeded directly
// through the harness's `db` Pool (connects as the `postgres` superuser),
// same as how the harness itself seeds `tenants`/`users`. Reading still
// needs *some* authenticated session (anon has no select grant either), so
// every test logs in as a freshly-seeded admin first.

await assertStackReachable();

const civilHolidayIds: string[] = [];
const forensicHolidayIds: string[] = [];

afterEach(async () => {
  await tenants.logout().catch(() => {});
  await cleanupAll();
  if (civilHolidayIds.length) {
    await db.query("delete from civil_holidays where id = any($1)", [civilHolidayIds.splice(0)]);
  }
  if (forensicHolidayIds.length) {
    await db.query("delete from forensic_holidays where id = any($1)", [forensicHolidayIds.splice(0)]);
  }
});
afterAll(closeHarness);

async function loginAsNewAdmin() {
  const tenantId = await seedTenant();
  const admin = await seedAdmin(tenantId);
  await tenants.login({ email: admin.email, password: admin.password });
  return { tenantId, admin };
}

async function insertCivilHoliday(date: string, uf: string | null, name: string) {
  const { rows } = await db.query<{ id: string }>(
    "insert into civil_holidays (date, uf, name) values ($1, $2, $3) returning id",
    [date, uf, name],
  );
  civilHolidayIds.push(rows[0]!.id);
}

async function insertForensicHoliday(startDate: string, endDate: string, description: string, sourceYear: number) {
  const { rows } = await db.query<{ id: string }>(
    "insert into forensic_holidays (start_date, end_date, description, source_year) values ($1, $2, $3, $4) returning id",
    [startDate, endDate, description, sourceYear],
  );
  forensicHolidayIds.push(rows[0]!.id);
}

// Fixture dates picked in a distinctive future year (2031) — collision-safe
// against any other seed/test data, and easy to eyeball in query results.
describe("deadlines.repository — resolveNonBusinessDates", () => {
  it("merges national + matching-uf civil holidays and excludes another uf's holiday", async () => {
    await loginAsNewAdmin();
    await insertCivilHoliday("2031-05-08", null, `Nacional ${randomUUID()}`);
    await insertCivilHoliday("2031-07-09", "SP", `Revolução Constitucionalista ${randomUUID()}`);
    await insertCivilHoliday("2031-09-20", "RS", `Farroupilha ${randomUUID()}`);

    const dates = await repo.resolveNonBusinessDates("SP", "2031-01-01", "2031-12-31");

    expect(dates.has("2031-05-08")).toBe(true);
    expect(dates.has("2031-07-09")).toBe(true);
    expect(dates.has("2031-09-20")).toBe(false);
  });

  it("includes forensic-recess dates (national-only, no uf filter)", async () => {
    await loginAsNewAdmin();
    await insertForensicHoliday("2031-12-20", "2032-01-06", `Recesso ${randomUUID()}`, 2031);

    const dates = await repo.resolveNonBusinessDates("MG", "2031-12-01", "2032-01-31");

    expect(dates.has("2031-12-20")).toBe(true);
    expect(dates.has("2031-12-25")).toBe(true);
    expect(dates.has("2032-01-06")).toBe(true);
    // Boundaries: the day before/after the recess must not be included.
    expect(dates.has("2031-12-19")).toBe(false);
    expect(dates.has("2032-01-07")).toBe(false);
  });

  it("respects the [from, to] date-range boundary, excluding holidays outside it", async () => {
    await loginAsNewAdmin();
    await insertCivilHoliday("2031-05-08", null, `Dentro ${randomUUID()}`);
    await insertCivilHoliday("2031-11-15", null, `Fora ${randomUUID()}`);

    const dates = await repo.resolveNonBusinessDates("SP", "2031-05-01", "2031-05-31");

    expect(dates.has("2031-05-08")).toBe(true);
    expect(dates.has("2031-11-15")).toBe(false);
  });

  it("clips an out-of-range recess tail to the requested window", async () => {
    await loginAsNewAdmin();
    await insertForensicHoliday("2031-12-20", "2032-01-06", `Recesso ${randomUUID()}`, 2031);

    // Window ends mid-recess — only the in-window portion should appear.
    const dates = await repo.resolveNonBusinessDates("SP", "2031-12-01", "2031-12-25");

    expect(dates.has("2031-12-20")).toBe(true);
    expect(dates.has("2031-12-25")).toBe(true);
    expect(dates.has("2031-12-26")).toBe(false);
    expect(dates.has("2032-01-06")).toBe(false);
  });
});
