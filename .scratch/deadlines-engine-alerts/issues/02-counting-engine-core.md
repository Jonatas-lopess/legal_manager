# 02: Counting engine core (pure function + holiday resolution)

**What to build:** `deadlines.service.ts`'s pure `computeDueDate` — input `(start_date, counting_mode, a resolved list of non-business dates)`, output a single due date, zero I/O; weekend skipping computed inside the function itself. `deadlines.repository.ts`'s holiday resolution — given a matter's `uf` and a date range, returns the merged set of applicable `civil_holidays` (national + that `uf`) and `forensic_holidays` (national-only, MVP) rows. No CRUD, no UI yet — this ticket is the differentiator's core math, proven correct in isolation before anything is built on top of it.

**Blocked by:** 01 (`deadlines` columns, `civil_holidays`/`forensic_holidays` tables)

**Status:** done

- [x] `computeDueDate` is a pure function: no database or network call, deterministic for a given input
- [x] `dias_corridos`: due date is a plain calendar-day count from `start_date`, ignoring weekends/holidays entirely
- [x] `dias_uteis`: skips Saturdays/Sundays
- [x] `dias_uteis`: skips national civil holidays
- [x] `dias_uteis`: skips the civil holidays of the matter's own `uf` only (not another state's)
- [x] `dias_uteis`: skips the national forensic-recess period
- [x] A computed due date landing on a weekend/holiday/recess day rolls forward to the next business day
- [x] A `start_date` itself on a non-business day begins the count from the next business day
- [x] Overlapping holiday sources (e.g. a national holiday inside the recess window) don't double-count or break the count
- [x] `deadlines.repository.ts`'s holiday resolution returns the correct merged set for a given `uf` + date range, tested against a real disposable Postgres instance (reuse the `postgres-schema-rls`/01 harness)

## Comments

Implemented: `apps/web/src/modules/deadlines/deadlines.service.ts` (`computeDueDate`), `deadlines.repository.ts` (`resolveNonBusinessDates`), tests in `test/deadlines.service.test.ts` (10) + `test/deadlines.repository.test.ts` (4). 14/14 new, 54/54 full `apps/web` suite, `tsc --noEmit` clean.

**Spec gap found and resolved, flagged for ticket 03**: nothing in the schema (through ticket 01) or spec carries the deadline's actual day-count ("15 dias úteis") — `computeDueDate` needs it as an explicit `days: number` input. Resolved directly below (not silently): added a `days` integer column to `deadlines` (see `packages/db/src/schema.ts` and the follow-up migration `20260909163500_deadlines-days-column.sql`) — ticket 03 must surface it as a required create-form field and pass it into `computeDueDate`.

**Design decision for ticket 03 to know**: for `dias_uteis`, `start_date` itself is excluded from the count (CPC art. 224) — counting begins at the first business day at/after `start_date`, which doesn't itself count toward `days`.
