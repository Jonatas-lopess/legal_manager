import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeDueDate, dueDateHighlight } from "../deadlines.service";

// Pure fixture-table tests (spec's Testing Decisions) — no DB, no network.
// Weekday reference for every fixture date used below (all UTC):
//   2026-05-04 Mon  2026-05-05 Tue  2026-05-06 Wed  2026-05-07 Thu
//   2026-05-08 Fri  2026-05-09 Sat  2026-05-10 Sun  2026-05-11 Mon
//   2026-05-12 Tue  2026-05-15 Fri  2026-05-18 Mon
//   2026-12-16 Wed  2026-12-20 Sun (forensic recess start)  2027-01-06 Wed
//   (forensic recess end)  2027-01-11 Mon

describe("computeDueDate — dias_corridos", () => {
  it("adds N calendar days flat, ignoring weekends/holidays even if present in the set (story 8)", () => {
    // 2026-05-04 + 10 calendar days = 2026-05-14. The would-be due date is
    // deliberately also passed in as a "holiday" to prove dias_corridos
    // never even looks at nonBusinessDates.
    const due = computeDueDate("2026-05-04", 10, "dias_corridos", new Set(["2026-05-14"]));
    expect(due).toBe("2026-05-14");
  });
});

describe("computeDueDate — dias_uteis", () => {
  it("skips Saturdays/Sundays with an empty holiday set (story 9)", () => {
    // Mon 05-04, 5 business days: Tue/Wed/Thu/Fri (4), weekend skipped, Mon
    // 05-11 (5th) — the start day itself doesn't count (see art. 224 note
    // in deadlines.service.ts).
    const due = computeDueDate("2026-05-04", 5, "dias_uteis", new Set());
    expect(due).toBe("2026-05-11");
  });

  it("also skips a national civil holiday, rolling the due date forward past it (stories 10 + 13)", () => {
    // Same start/count as above, but Fri 05-08 is a national holiday — the
    // due date pushes from 05-11 to 05-12 because that Friday no longer
    // counts toward the 5.
    const due = computeDueDate("2026-05-04", 5, "dias_uteis", new Set(["2026-05-08"]));
    expect(due).toBe("2026-05-12");
  });

  it("skips whatever dates it's handed, regardless of why they're non-business (uf-matching is the repository's job, story 11)", () => {
    // By the time a set reaches computeDueDate, uf-filtering already
    // happened in deadlines.repository.ts — this function has no `uf`
    // parameter and no opinion on it. See deadlines.repository.test.ts for
    // the uf-matching proof at the resolution layer.
    const due = computeDueDate("2026-05-04", 5, "dias_uteis", new Set(["2026-05-08"]));
    expect(due).toBe("2026-05-12");
  });

  it("skips a full multi-day forensic-recess range (story 12)", () => {
    // Wed 2026-12-16, 5 business days, with the real CNJ year-end recess
    // (2026-12-20 through 2027-01-06, inclusive, expanded to individual
    // dates as deadlines.repository.ts would hand them over) in the set.
    const recess = expandRange("2026-12-20", "2027-01-06");
    const due = computeDueDate("2026-12-16", 5, "dias_uteis", recess);
    expect(due).toBe("2027-01-11");
  });

  it("a start_date on a weekend begins counting from the next business day, not from the weekend day (story 14)", () => {
    // Start Sat 05-09: effective start becomes Mon 05-11 (not counted
    // itself), so 1 business day later is Tue 05-12 — proves the start-day
    // exclusion applies to the *adjusted* start, not the original weekend
    // date (a due date of Mon 05-11 would mean the weekend day silently
    // counted as day 1, which it must not).
    const due = computeDueDate("2026-05-09", 1, "dias_uteis", new Set());
    expect(due).toBe("2026-05-12");
  });

  it("a start_date on a holiday weekday also defers to the next business day (story 14, non-weekend case)", () => {
    // Mon 05-04 is itself in the holiday set — effective start becomes Tue
    // 05-05, so 1 business day later is Wed 05-06.
    const due = computeDueDate("2026-05-04", 1, "dias_uteis", new Set(["2026-05-04"]));
    expect(due).toBe("2026-05-06");
  });

  it("a national holiday that also falls inside a forensic-recess range doesn't double-count or break the count", () => {
    const recess = expandRange("2026-12-20", "2027-01-06");
    const recessWithOverlap = new Set(recess);
    recessWithOverlap.add("2026-12-25"); // already inside the recess — a Set absorbs the duplicate for free

    const dueWithOverlap = computeDueDate("2026-12-16", 5, "dias_uteis", recessWithOverlap);
    const dueWithoutDuplicate = computeDueDate("2026-12-16", 5, "dias_uteis", new Set(recess));

    expect(recessWithOverlap.size).toBe(recess.size);
    expect(dueWithOverlap).toBe(dueWithoutDuplicate);
    expect(dueWithOverlap).toBe("2027-01-11");
  });

  it("chains through consecutive non-business days — a holiday immediately followed by a weekend (rollforward edge case)", () => {
    // Mon 05-11, 4 business days: Tue/Wed/Thu (3), then Fri 05-15 is a
    // holiday (skipped), then Sat/Sun (skipped), landing on Mon 05-18 for
    // the 4th — a single rollforward step wouldn't be enough (Fri -> Sat is
    // still non-business); the loop must walk all the way to Monday.
    const withoutHoliday = computeDueDate("2026-05-11", 4, "dias_uteis", new Set());
    expect(withoutHoliday).toBe("2026-05-15");

    const withHoliday = computeDueDate("2026-05-11", 4, "dias_uteis", new Set(["2026-05-15"]));
    expect(withHoliday).toBe("2026-05-18");
  });

  it("accepts a plain string array as well as a Set for nonBusinessDates", () => {
    const due = computeDueDate("2026-05-04", 5, "dias_uteis", ["2026-05-08"]);
    expect(due).toBe("2026-05-12");
  });
});

// dueDateHighlight — the listing/report vencido/vence-em-breve heuristic
// (moved here from DeadlinesTable.tsx so dashboard-reports can reuse it
// instead of reimplementing the comparison, per that feature's spec).
// System clock pinned so "today" is deterministic in every case.
describe("dueDateHighlight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 10)); // 2026-05-10, local time
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a pendente deadline already past due is vencido", () => {
    expect(dueDateHighlight("2026-05-09", "pendente")).toBe("vencido");
  });

  it("a pendente deadline due today is vence_em_breve", () => {
    expect(dueDateHighlight("2026-05-10", "pendente")).toBe("vence_em_breve");
  });

  it("a pendente deadline due within the next 5 calendar days is vence_em_breve", () => {
    expect(dueDateHighlight("2026-05-15", "pendente")).toBe("vence_em_breve");
  });

  it("a pendente deadline due more than 5 calendar days out is on_track", () => {
    expect(dueDateHighlight("2026-05-16", "pendente")).toBe("on_track");
  });

  it("a cumprido deadline is always on_track, even if its due date is in the past", () => {
    expect(dueDateHighlight("2026-05-09", "cumprido")).toBe("on_track");
  });
});

/** Test-local fixture helper — mirrors what deadlines.repository.ts's
 * resolveNonBusinessDates hands to the service (a set of individual date
 * strings, recess ranges already expanded). Not imported from the
 * repository — this test suite stays DB-free. */
function expandRange(startIso: string, endIso: string): Set<string> {
  const dates = new Set<string>();
  let cursor = startIso;
  while (cursor <= endIso) {
    dates.add(cursor);
    const [year, month, day] = cursor.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1, day) + 86_400_000);
    cursor = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  }
  return dates;
}
