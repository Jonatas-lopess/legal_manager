import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePeriodoRange } from "../reports.service";

// Pure fixture-table tests (spec's Testing Decisions: "unit test, fake
// timers, exact-date-literal assertions, no DB") — mirrors
// deadlines.service.test.ts's dueDateHighlight suite shape. System clock
// pinned so "today" is deterministic in every case.
describe("resolvePeriodoRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 10)); // 2026-05-10, local time
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("7d: from is today minus 7 calendar days, to is today", () => {
    expect(resolvePeriodoRange("7d")).toEqual({ from: "2026-05-03", to: "2026-05-10" });
  });

  it("30d: from is today minus 30 calendar days, to is today", () => {
    expect(resolvePeriodoRange("30d")).toEqual({ from: "2026-04-10", to: "2026-05-10" });
  });

  it("90d: from is today minus 90 calendar days, to is today", () => {
    expect(resolvePeriodoRange("90d")).toEqual({ from: "2026-02-09", to: "2026-05-10" });
  });

  it("6m: from is today minus 6 calendar months (rolls back a year when needed), to is today", () => {
    expect(resolvePeriodoRange("6m")).toEqual({ from: "2025-11-10", to: "2026-05-10" });
  });

  it("12m: from is today minus 12 calendar months (same day/month, prior year), to is today", () => {
    expect(resolvePeriodoRange("12m")).toEqual({ from: "2025-05-10", to: "2026-05-10" });
  });

  it("6m: clamps the day-of-month when the target month is shorter (Aug 31 minus 6 months has no Feb 31)", () => {
    vi.setSystemTime(new Date(2026, 7, 31)); // 2026-08-31, local time
    expect(resolvePeriodoRange("6m")).toEqual({ from: "2026-02-28", to: "2026-08-31" });
  });
});
