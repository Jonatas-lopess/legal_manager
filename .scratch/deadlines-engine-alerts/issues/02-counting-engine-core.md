# 02: Counting engine core (pure function + holiday resolution)

**What to build:** `deadlines.service.ts`'s pure `computeDueDate` — input `(start_date, counting_mode, a resolved list of non-business dates)`, output a single due date, zero I/O; weekend skipping computed inside the function itself. `deadlines.repository.ts`'s holiday resolution — given a matter's `uf` and a date range, returns the merged set of applicable `civil_holidays` (national + that `uf`) and `forensic_holidays` (national-only, MVP) rows. No CRUD, no UI yet — this ticket is the differentiator's core math, proven correct in isolation before anything is built on top of it.

**Blocked by:** 01 (`deadlines` columns, `civil_holidays`/`forensic_holidays` tables)

**Status:** ready-for-agent

- [ ] `computeDueDate` is a pure function: no database or network call, deterministic for a given input
- [ ] `dias_corridos`: due date is a plain calendar-day count from `start_date`, ignoring weekends/holidays entirely
- [ ] `dias_uteis`: skips Saturdays/Sundays
- [ ] `dias_uteis`: skips national civil holidays
- [ ] `dias_uteis`: skips the civil holidays of the matter's own `uf` only (not another state's)
- [ ] `dias_uteis`: skips the national forensic-recess period
- [ ] A computed due date landing on a weekend/holiday/recess day rolls forward to the next business day
- [ ] A `start_date` itself on a non-business day begins the count from the next business day
- [ ] Overlapping holiday sources (e.g. a national holiday inside the recess window) don't double-count or break the count
- [ ] `deadlines.repository.ts`'s holiday resolution returns the correct merged set for a given `uf` + date range, tested against a real disposable Postgres instance (reuse the `postgres-schema-rls`/01 harness)
