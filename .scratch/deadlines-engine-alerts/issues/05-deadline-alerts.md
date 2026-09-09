# 05: Deadline alerts (email + in-app)

**What to build:** `supabase/functions/deadlines-alerts/` (same `index.ts`/`service.ts`/`repository.ts` split), triggered daily by `pg_cron`+`pg_net`. Scans `pendente` deadlines whose `due_date` is exactly 5 or exactly 1 dias úteis from today (reusing ticket 02's holiday-resolution logic, not reimplemented), inserts one `notifications` row per (deadline, threshold, channel) — the unique constraint from ticket 01 makes a rerun/overlap a no-op — then sends the e-mail for every newly-inserted `email` row via Resend. Recipients: every user in the deadline's tenant (queried via service-role, bypassing RLS — no "responsible lawyer" field exists to target more narrowly). E-mail names the matter, the deadline's description, and the due date. Lightweight in-app notification list/dropdown reading the caller's own `notifications` rows, with a mark-as-read action.

Real-world civil-holiday coverage in the computed thresholds depends on ticket 04 having synced at least once in the environment — this ticket's own tests seed fixture holiday rows directly and don't block on that.

**Blocked by:** 03 (deadlines CRUD/`due_date`/`cumprido` status to scan)

**Status:** done

- [x] E-mail sent when a `pendente` deadline reaches exactly 5 dias úteis before `due_date`
- [x] E-mail sent when the same deadline reaches exactly 1 dia útil before `due_date`
- [x] Same two thresholds also create an in-app `notifications` row
- [x] A deadline marked `cumprido` before a threshold fires generates no alert for that threshold
- [x] Each (deadline, threshold, channel) alert fires exactly once even if the job reruns/overlaps (dedup via the ticket-01 unique constraint)
- [x] Alerts are scoped to the deadline's own tenant's members only
- [x] E-mail body names the matter, the deadline's description, and the due date
- [x] In-app notification list shows the caller's own `notifications`; mark-as-read sets `read_at`
- [x] `pg_cron`+`pg_net` schedule invokes the function daily
- [x] Test: threshold detection (exactly 5/1 dias úteis, using known fixture holidays) against the local Supabase stack
- [x] Test: dedup — simulated rerun produces no duplicate send (Resend call mocked at the boundary)
- [x] Test: `cumprido` deadline produces no alert
- [x] Test: tenant-scoped fan-out reaches the correct set of recipient `user_id`s and no others

## Comments

Implemented: `supabase/functions/deadlines-alerts/` (`index.ts`/`service.ts`/`repository.ts` + tests, same split as `deadlines-holiday-sync`), migrations `20260909191006_deadlines-alerts-cron.sql` (daily pg_cron+pg_net) + `20260909191140_notifications-dedup-per-recipient.sql` (schema fix, see below), `apps/web/src/modules/notifications/` (new module: repository/service/controller/schema + `NotificationsDropdown.tsx`, wired into `App.tsx`'s header).

**Bug found and fixed in ticket 01's schema**: the `notifications` unique index was `(deadline_id, threshold, channel)` only — with multi-recipient fan-out (every tenant member), the 2nd/3rd recipient's row for the same alert would silently no-op against `ON CONFLICT DO NOTHING`, so only one tenant member would ever actually get notified. Fixed by adding `recipient_user_id` to the index. Same "gap found mid-ticket, fixed via documented follow-up migration" pattern as the `days` column fix.

**Pre-existing bug found, NOT fixed (out of scope, belongs to `postgres-schema-rls`/04)**: deleting a tenant with any audited child row (`clients`/`matters`/`payments`) fails with an `audit_log_tenant_id_tenants_id_fk` violation — the cascade delete removes the tenant row before the audit trigger's insert referencing it commits. This left ~300+ orphaned test tenants on the local stack from other test suites' `cleanupAll()` silently failing. Worked around in this ticket's own test harness (explicit child-row cleanup before tenant delete); the trigger itself needs a fix from whoever owns that ticket.

Verify: `deadlines-alerts` 5/5 tests, `deadlines-holiday-sync` still 3/3 (no regression), `apps/web` 64/64 (61 + 3 new), `tsc --noEmit` clean everywhere, root `pnpm lint` clean, `packages/db` Testcontainers full-replay 69/69 (confirms both new migrations are structurally sound), `supabase migration up` applied cleanly and idempotently, stack never reset.

**Unverified before production**: Resend wire format is doc-verified (fetched live) but never exercised against a real account/key; `RESEND_API_KEY`/`RESEND_FROM_EMAIL` env vars and the two Vault secrets for the cron job need real one-time setup per environment.
