# 03: Deadlines + deadline_tags

**What to build:** `deadlines` (`matter_id` FK, `is_fatal` bool, `counting_mode` enum `dias_uteis`/`dias_corridos`) — the fields the future deadline-counting engine will read directly, per ADR-0003. `deadline_tags` extends the existing `tags`/`matter_tags` join pattern (from ticket 02) to deadlines, for freeform cosmetic labeling that never affects counting. RLS enabled+forced via `current_tenant_id()`.

**Blocked by:** 02 (clients + catalog + matters + tags)

**Status:** done

- [x] `deadlines` table: `matter_id` FK, `is_fatal` bool, `counting_mode` enum (`dias_uteis`/`dias_corridos`)
- [x] `deadline_tags` join table extends the `tags` pattern to `deadlines`
- [x] RLS enabled + forced on both tables via `current_tenant_id()`
- [x] Test: same-tenant vs cross-tenant read/write on `deadlines` and `deadline_tags`
- [x] Test: tagging a deadline has no effect on `is_fatal`/`counting_mode` (labels stay cosmetic)

## Comments

Implemented: migrations `20260905023834_deadlines-deadline-tags.sql` +
`..._rls.sql`. `deadlines` deliberately carries only `matter_id`/`is_fatal`/
`counting_mode` (+ id/tenant_id/timestamps) — no `start_date`/`due_date`/
`description`/status, those are `deadlines-engine-alerts`'s job per its own
problem statement. Same composite-FK-against-`unique(id, tenant_id)` pattern
as `matter_tags` used for `deadline_tags`; same select/insert/delete
three-policy split as `matter_tags` (not one `for all`, which would silently
also grant update — caught in review on the `matter_tags` case, applied here
too). Tests in `03-deadlines-deadline-tags.test.ts`, 6/6 passing.
