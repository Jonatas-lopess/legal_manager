# 05: Deadline alerts (email + in-app)

**What to build:** `supabase/functions/deadlines-alerts/` (same `index.ts`/`service.ts`/`repository.ts` split), triggered daily by `pg_cron`+`pg_net`. Scans `pendente` deadlines whose `due_date` is exactly 5 or exactly 1 dias úteis from today (reusing ticket 02's holiday-resolution logic, not reimplemented), inserts one `notifications` row per (deadline, threshold, channel) — the unique constraint from ticket 01 makes a rerun/overlap a no-op — then sends the e-mail for every newly-inserted `email` row via Resend. Recipients: every user in the deadline's tenant (queried via service-role, bypassing RLS — no "responsible lawyer" field exists to target more narrowly). E-mail names the matter, the deadline's description, and the due date. Lightweight in-app notification list/dropdown reading the caller's own `notifications` rows, with a mark-as-read action.

Real-world civil-holiday coverage in the computed thresholds depends on ticket 04 having synced at least once in the environment — this ticket's own tests seed fixture holiday rows directly and don't block on that.

**Blocked by:** 03 (deadlines CRUD/`due_date`/`cumprido` status to scan)

**Status:** ready-for-agent

- [ ] E-mail sent when a `pendente` deadline reaches exactly 5 dias úteis before `due_date`
- [ ] E-mail sent when the same deadline reaches exactly 1 dia útil before `due_date`
- [ ] Same two thresholds also create an in-app `notifications` row
- [ ] A deadline marked `cumprido` before a threshold fires generates no alert for that threshold
- [ ] Each (deadline, threshold, channel) alert fires exactly once even if the job reruns/overlaps (dedup via the ticket-01 unique constraint)
- [ ] Alerts are scoped to the deadline's own tenant's members only
- [ ] E-mail body names the matter, the deadline's description, and the due date
- [ ] In-app notification list shows the caller's own `notifications`; mark-as-read sets `read_at`
- [ ] `pg_cron`+`pg_net` schedule invokes the function daily
- [ ] Test: threshold detection (exactly 5/1 dias úteis, using known fixture holidays) against the local Supabase stack
- [ ] Test: dedup — simulated rerun produces no duplicate send (Resend call mocked at the boundary)
- [ ] Test: `cumprido` deadline produces no alert
- [ ] Test: tenant-scoped fan-out reaches the correct set of recipient `user_id`s and no others
