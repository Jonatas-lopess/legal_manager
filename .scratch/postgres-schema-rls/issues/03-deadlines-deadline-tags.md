# 03: Deadlines + deadline_tags

**What to build:** `deadlines` (`matter_id` FK, `is_fatal` bool, `counting_mode` enum `dias_uteis`/`dias_corridos`) — the fields the future deadline-counting engine will read directly, per ADR-0003. `deadline_tags` extends the existing `tags`/`matter_tags` join pattern (from ticket 02) to deadlines, for freeform cosmetic labeling that never affects counting. RLS enabled+forced via `current_tenant_id()`.

**Blocked by:** 02 (clients + catalog + matters + tags)

**Status:** ready-for-agent

- [ ] `deadlines` table: `matter_id` FK, `is_fatal` bool, `counting_mode` enum (`dias_uteis`/`dias_corridos`)
- [ ] `deadline_tags` join table extends the `tags` pattern to `deadlines`
- [ ] RLS enabled + forced on both tables via `current_tenant_id()`
- [ ] Test: same-tenant vs cross-tenant read/write on `deadlines` and `deadline_tags`
- [ ] Test: tagging a deadline has no effect on `is_fatal`/`counting_mode` (labels stay cosmetic)
