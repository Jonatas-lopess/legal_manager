import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { HolidayRecord, Jurisdiction } from "../repository.ts";
import { syncCivilHolidays } from "../service.ts";
import { closeHarness, db, deleteHolidaysByDates, fetchHolidaysByDates, seedHoliday } from "./harness.ts";

// Far-future year/dates so these fixtures can never collide with anything a
// real FeriadosAPI sync (or another test run) might have written — this
// table has no tenant_id/test-run marker to scope by, it's global reference
// data, so isolation here is "use dates nothing else will ever use".
const FIXTURE_YEAR = 2099;
const NATIONAL_DATE = "2099-12-25";
const SP_DATE = "2099-11-20";
const ALL_FIXTURE_DATES = [NATIONAL_DATE, SP_DATE];

let datesToCleanUp: string[] = [];

afterEach(async () => {
  if (datesToCleanUp.length > 0) {
    await deleteHolidaysByDates(datesToCleanUp);
    datesToCleanUp = [];
  }
});
afterAll(closeHarness);

/** Fixed, jurisdiction-aware fixture standing in for a real FeriadosAPI response. */
function fixedFetchHolidays(name = "Natal (fixture)") {
  return async (jurisdiction: Jurisdiction, year: number): Promise<HolidayRecord[]> => {
    if (year !== FIXTURE_YEAR) return [];
    if (jurisdiction.uf === null) return [{ date: NATIONAL_DATE, uf: null, name }];
    if (jurisdiction.uf === "SP") {
      return [{ date: SP_DATE, uf: "SP", name: "Revolução Constitucionalista (fixture)" }];
    }
    return [];
  };
}

describe("deadlines-holiday-sync service", () => {
  it("idempotent rerun: no duplicate (date, uf) rows and the row count matches expectations", async () => {
    datesToCleanUp = ALL_FIXTURE_DATES;

    const first = await syncCivilHolidays(
      { db, fetchHolidays: fixedFetchHolidays() },
      { years: [FIXTURE_YEAR] },
    );
    expect(first.failures).toEqual([]);
    expect(first.totalUpserted).toBe(2); // one national + one SP row

    const second = await syncCivilHolidays(
      { db, fetchHolidays: fixedFetchHolidays() },
      { years: [FIXTURE_YEAR] },
    );
    expect(second.failures).toEqual([]);
    expect(second.totalUpserted).toBe(2); // same two rows re-upserted, not appended

    const rows = await fetchHolidaysByDates(ALL_FIXTURE_DATES);
    expect(rows).toHaveLength(2); // no duplicates after two runs
    expect(rows).toEqual([
      expect.objectContaining({ date: SP_DATE, uf: "SP", name: "Revolução Constitucionalista (fixture)" }),
      expect.objectContaining({ date: NATIONAL_DATE, uf: null, name: "Natal (fixture)" }),
    ]);
  });

  it("a corrected name from a rerun lands on the existing row (DO UPDATE, not DO NOTHING)", async () => {
    datesToCleanUp = ALL_FIXTURE_DATES;

    await syncCivilHolidays({ db, fetchHolidays: fixedFetchHolidays("Natal (fixture)") }, {
      years: [FIXTURE_YEAR],
    });
    await syncCivilHolidays({ db, fetchHolidays: fixedFetchHolidays("Natal do Senhor (corrigido)") }, {
      years: [FIXTURE_YEAR],
    });

    const rows = await fetchHolidaysByDates([NATIONAL_DATE]);
    expect(rows).toHaveLength(1); // still one row, not a second one alongside it
    expect(rows[0]).toMatchObject({ date: NATIONAL_DATE, uf: null, name: "Natal do Senhor (corrigido)" });
  });

  it("a simulated FeriadosAPI failure leaves pre-existing civil_holidays rows byte-for-byte unchanged", async () => {
    datesToCleanUp = ALL_FIXTURE_DATES;

    const seededNational = await seedHoliday({ date: NATIONAL_DATE, uf: null, name: "Natal (pré-existente)" });
    const seededSp = await seedHoliday({
      date: SP_DATE,
      uf: "SP",
      name: "Revolução Constitucionalista (pré-existente)",
    });
    const before = await fetchHolidaysByDates(ALL_FIXTURE_DATES);

    const failingFetch = async (): Promise<HolidayRecord[]> => {
      throw new Error("FeriadosAPI is down (simulated)");
    };

    const summary = await syncCivilHolidays({ db, fetchHolidays: failingFetch }, { years: [FIXTURE_YEAR] });

    // Every jurisdiction/year attempted (national + 27 UFs, one year) failed
    // — nothing was upserted, and the failure was recorded, not swallowed.
    expect(summary.results).toEqual([]);
    expect(summary.totalUpserted).toBe(0);
    expect(summary.failures.length).toBe(28);
    expect(summary.failures[0]).toMatchObject({ error: expect.stringContaining("FeriadosAPI is down") });

    const after = await fetchHolidaysByDates(ALL_FIXTURE_DATES);
    expect(after).toEqual(before); // byte-for-byte unchanged — no wipe, no partial write
    expect(after).toEqual([
      { id: seededSp.id, date: SP_DATE, uf: "SP", name: "Revolução Constitucionalista (pré-existente)" },
      { id: seededNational.id, date: NATIONAL_DATE, uf: null, name: "Natal (pré-existente)" },
    ]);
  });
});
