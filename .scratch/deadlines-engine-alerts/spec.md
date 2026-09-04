Status: ready-for-agent

# Deadlines: counting engine + listing + alerts (PLANNING §7 step 5)

## Problem Statement

By the time `postgres-schema-rls`, `tenants-auth-invite`, and `clients-catalog-matters-crud` land, an escritório can log in, register clients, and open matters — but there is still no way to track a single prazo (deadline) against a matter, and nothing computes when it's actually due. `deadlines` (per `postgres-schema-rls`/03) only carries `matter_id`/`is_fatal`/`counting_mode` — the columns a counting engine will read, but no engine exists yet, no screen lists deadlines, and nothing warns anyone before one is missed. This is the product's stated differentiator (PLANNING §1) and its highest-priority remaining step (§7 step 5) — a legal deadline missed because no one was reminded is the exact failure mode the product exists to prevent.

## Solution

Build the `deadlines` bounded context end to end: CRUD + a listing screen, a pure business-day counting engine that resolves `due_date` from a deadline's `start_date`/`counting_mode` and its parent matter's `uf`, aware of weekends, national/state civil holidays, and forensic-recess periods (feriado forense) — and two fixed-threshold alerts (5 dias úteis, 1 dia útil before `due_date`) delivered by e-mail and in-app notification.

Civil holidays (national/state) are synced from FeriadosAPI into a local cache table on a schedule, never called live from the engine — the engine only ever reads local tables, so its core date arithmetic stays a pure, deterministic, offline-testable function. Forensic-recess periods live in a separate, manually curated table (no in-app editor this round — PLANNING §8's annual manual-curation process, using AASP as the starting point, covers upkeep). Alerts are dispatched by a scheduled Edge Function (`pg_cron`+`pg_net`, per PLANNING §4) that writes a generic `notifications` row per (deadline, threshold) — the first real consumer of the channel-agnostic notification model PLANNING §5 asks for ("hoje: e-mail/in-app; depois: WhatsApp") — and sends the e-mail via Resend.

## User Stories

**Recording a deadline**

1. As an advogado, I want to create a deadline against a matter with a start date, a counting mode (`dias_uteis`/`dias_corridos`), and whether it's fatal, so the engine has everything it needs to compute a due date.
2. As an advogado, I want to give a deadline a short description (e.g. "Contestação", "Recurso de apelação"), so the listing and alerts are legible without opening the matter.
3. As any tenant member, I want the computed `due_date` shown immediately after saving, so I don't have to do the math myself or wait for a report to catch up.
4. As any tenant member, I want to attach freeform tags to a deadline (legal-act name, urgency, etc.), cosmetic only, never affecting the computed due date, so I can label/filter without risking the computation (ADR-0003).
5. As any tenant member, I want to edit a deadline's start date, counting mode, or description after creation, with `due_date` recomputed automatically, so a correction doesn't require deleting and recreating the record.
6. As any tenant member, I want to mark a deadline `cumprido` once satisfied, so it stops appearing as pending/overdue and stops generating further alerts.
7. As any tenant member (admin/advogado/secretario), I want full CRUD on deadlines regardless of my role, matching the PLANNING §8 matrix (no role restricts `deadlines` access), so nothing here needs a role check beyond tenant membership.

**Counting engine — dias corridos**

8. As an advogado, I want a `dias_corridos` deadline's due date to be a plain calendar-day count from the start date, ignoring weekends and holidays entirely, so it matches how "dias corridos" actually works procedurally.

**Counting engine — dias úteis + holidays**

9. As an advogado, I want a `dias_uteis` deadline to skip Saturdays and Sundays when counting, so the due date reflects only business days.
10. As an advogado, I want a `dias_uteis` deadline to also skip national civil holidays, so a due date never lands on a day nobody works.
11. As an advogado, I want a `dias_uteis` deadline to skip the civil holidays of the matter's own `uf` (state), and never another state's, so a matter filed in SP isn't shifted by a holiday that only applies in RS.
12. As an advogado, I want a `dias_uteis` deadline to skip the national forensic-recess period (CNJ Resolução 244/2016, year-end recess), so the engine matches how courts actually count during recess, not just civil holidays.
13. As an advogado, I want a computed due date that would land on a weekend/holiday/recess day to roll forward to the next business day, so the result is always an actionable date.
14. As an advogado starting a deadline whose `start_date` itself falls on a non-business day, I want the count to begin from the next business day, so the computation doesn't silently start on a day nobody could have acted on.
15. As a developer, I want the counting engine to be a pure function of `(start_date, counting_mode, holiday set)` with no I/O, so its date arithmetic can be exhaustively unit-tested without a database or network call.

**Civil holiday sourcing**

16. As a developer, I want national/state civil holidays synced from FeriadosAPI into a local table on a schedule, so the engine never depends on a live network call to compute a due date.
17. As a developer, I want the sync job to be idempotent (safe to rerun), so a retried or overlapping cron run never produces duplicate holiday rows.
18. As a developer, I want a sync failure (FeriadosAPI down/erroring) to leave the existing cached holidays untouched rather than wiping them, so a transient outage never breaks every due-date computation for that day.

**Listing screen**

19. As any tenant member, I want to list my tenant's deadlines, filterable by matter and by status (`pendente`/`cumprido`), so I can find a specific one quickly.
20. As any tenant member, I want deadlines visually distinguished by overdue/vence-em-breve/on-track state in the list, so I can triage at a glance without opening each row.
21. As any tenant member, I want fatal deadlines visually flagged (badge/priority) ahead of non-fatal ones, so the higher-stakes items stand out in a shared list (CONTEXT.md: `is_fatal` "drives alert priority").
22. As any tenant member, I want to see a deadline's tags in the list/detail view, so cosmetic labeling is actually useful for scanning, not just stored.
23. As any tenant member, I want the deadline list scoped strictly to my own tenant, so I never see another escritório's prazos even by ID guessing.

**Alerts**

24. As any tenant member, I want an e-mail sent when a pending, non-cumprido deadline reaches exactly 5 dias úteis before its due date, so I get an early warning while there's still time to act.
25. As any tenant member, I want a second e-mail sent when the same deadline reaches exactly 1 dia útil before its due date, so I get a final warning even if the first one was missed.
26. As any tenant member, I want the same two thresholds to also create an in-app notification, so someone who doesn't check e-mail promptly still sees the warning on next login.
27. As any tenant member, I want a deadline marked `cumprido` before a threshold fires to never generate that alert, so completed work doesn't keep nagging anyone.
28. As any tenant member, I want each (deadline, threshold) alert to fire exactly once even if the scheduled job reruns or overlaps, so I never get duplicate e-mails for the same warning.
29. As any tenant member, I want to mark an in-app notification read, so my notification list reflects what I've actually seen.
30. As any tenant member, I want every alert (e-mail and in-app) scoped to my own tenant's members only, so a shared cron job never leaks a notification across tenants.
31. As any tenant member, I want the alert e-mail to name the matter, the deadline's description, and the due date, so I don't have to log in just to know what it's about.

## Implementation Decisions

- **Modules**: fill in `apps/web/src/modules/deadlines/*` per the existing stub layout. `deadlines.repository.ts` is the only file querying `deadlines`, `civil_holidays`, `forensic_holidays` directly; it also resolves a matter's `uf` by calling `matters.service.ts`'s public interface, never `matters.repository.ts` (PLANNING §6 cross-context rule). `deadlines.schema.ts` re-exports/refines `packages/schema` Zod shapes for create/edit input. `components/` gets `DeadlineDialog` and the listing table.
- **Engine seam (the unit under test)**: `deadlines.service.ts` exposes a pure `computeDueDate` — input is `(start_date, counting_mode, a resolved list of non-business dates)`, output is a single due date, zero I/O. `deadlines.repository.ts` is solely responsible for resolving *which* holidays apply (civil, by the matter's `uf` and national; forensic recess, national-only for MVP) for a given date range, and hands that resolved list to the service. Weekend skipping is computed in the pure function itself, not stored anywhere.
- **`is_fatal` semantics**: read directly by the engine per ADR-0003, but does **not** change the counting math or the alert thresholds — MVP alert thresholds are fixed and identical for fatal/non-fatal (PLANNING §4: "sem configuração por tenant"). Its effect is presentation-only: sort/visual priority in the listing screen and in notification payloads, per CONTEXT.md's "drive alert priority" note.
- **Schema — `deadlines` (extends `postgres-schema-rls`/03)**: that ticket only specifies `matter_id`/`is_fatal`/`counting_mode`. This feature needs four more columns on the same table: `start_date` (date, not null), `description` (text, not null — the human label of the legal act; distinct from cosmetic tags), `status` (enum `pendente`/`cumprido`, default `pendente`), `due_date` (date, not null, written only by `deadlines.service.ts`, never a raw client-editable form field). See Further Notes on how this interacts with ticket 03.
- **Schema — `civil_holidays`** (new, global reference data, no `tenant_id`): `date`, `uf` (nullable — null means it applies nationally), `name`. Unique on `(date, uf)`. Readable by any authenticated user; no client-facing INSERT/UPDATE/DELETE policy — only the sync Edge Function's service-role key writes to it.
- **Schema — `forensic_holidays`** (new, global reference data, no `tenant_id`, MVP is national-only per PLANNING §4 — no `uf`/comarca column yet): `start_date`, `end_date`, `description`, `source_year`. Same access shape as `civil_holidays`: readable by all, writable only by service-role (seed script/manual SQL for now — no in-app editor this round).
- **Schema — `notifications`** (new, the channel-agnostic model PLANNING §5 asks to model now): `tenant_id`, `recipient_user_id`, `channel` (`email`/`in_app`), `category` (text, e.g. `deadline_alert`, extensible), `deadline_id` (nullable FK — null for future non-deadline notification types), `threshold` (nullable text, e.g. `5_dias_uteis`/`1_dia_util`), `payload` (jsonb — matter/deadline snapshot for the e-mail body), `status` (`pending`/`sent`/`failed`), `read_at` (nullable, in-app read state), `created_at`, `sent_at`. Unique constraint on `(deadline_id, threshold, channel)` where `deadline_id` is not null — the dedup mechanism behind story 28. RLS: `SELECT`/`UPDATE` (for `read_at`) scoped to `tenant_id = current_tenant_id() AND recipient_user_id = auth.uid()`; no client-facing `INSERT` — only the alerts Edge Function's service-role key creates rows (same lockdown pattern as `users` in `tenants-auth-invite`/03).
- **Alert recipients**: every user in the deadline's tenant (all three roles have `deadlines` access per PLANNING §8, and ADR-0001 already establishes no isolation between same-tenant users on matter visibility) — there's no "responsible lawyer" field on `matters`/`deadlines` yet to target more narrowly. The alerts Edge Function queries `users` (service-role, bypasses RLS) for every member of the deadline's tenant to fan the notification out to.
- **Civil holiday sync**: `supabase/functions/deadlines-holiday-sync/` (Deno Edge Function, `index.ts`/`service.ts`/`repository.ts` split per PLANNING §6), triggered monthly by `pg_cron`+`pg_net`. Calls FeriadosAPI (Professional plan, per PLANNING §8) for national + all 27 UFs, upserts into `civil_holidays` on `(date, uf)`. A failed API call logs and exits without touching existing rows (story 18).
- **Alert dispatch**: `supabase/functions/deadlines-alerts/` (same split), triggered daily by `pg_cron`+`pg_net`. Scans `pendente` deadlines whose `due_date` is exactly 5 or exactly 1 dias úteis from today (using the same engine holiday-resolution logic as `deadlines.repository.ts`, not reimplemented), inserts one `notifications` row per (deadline, threshold, channel) — relying on the unique constraint to make a rerun/overlap a no-op — then sends the e-mail for every newly-inserted `email` row via Resend.
- **Email provider**: Resend, called directly from `deadlines-alerts` via its REST API — first use of a dedicated transactional-email vendor in this repo (auth e-mails stay on Supabase Auth's own SMTP config, untouched by this spec).
- **Listing screen**: `AppShell`/`TableCard` from `panel-kit.tsx` (PLANNING §2), matching the pattern `clients-catalog-matters-crud` establishes for its list views. Columns: matter (client + catalog item), description, due date, `is_fatal` badge, status, tags. Quick filters: by matter, by status; overdue/vence-em-breve highlighting reuses the same due-date comparison the alerts job uses, computed client-side against the stored `due_date` (no separate report query — the full aggregate dashboard is step 6, out of scope here).
- **In-app notifications UI**: a lightweight list/dropdown (per-user, per PLANNING §5's "in-app" channel) reading the caller's own `notifications` rows (RLS already scopes it), with a mark-as-read action (`read_at`) — not a full notification center, just enough to satisfy stories 26/29.

## Testing Decisions

- **Engine (`computeDueDate`)**: the primary unit under test, exercised as pure fixture-based table tests — no DB, no network. Coverage: `dias_corridos` plain addition; `dias_uteis` skipping weekends only; skipping a national holiday; skipping a state holiday only for the matching `uf` and not others; skipping a full forensic-recess range; a due date landing on a non-business day rolling forward; a `start_date` itself on a non-business day; overlapping holiday sources (e.g. a national holiday inside the recess window) not double-counting or breaking.
- **Holiday resolution (`deadlines.repository.ts`)**: integration-tested against a real disposable Postgres instance, reusing the harness `postgres-schema-rls`/01 establishes — verifies the correct merge/filter of `civil_holidays` (national + matching `uf`) and `forensic_holidays` for a given date range, and that RLS/read-access on both reference tables behaves as decided above.
- **`deadlines.service.ts` CRUD/status behavior**: same seam convention as `clients-catalog-matters-crud` — service-level tests against the local Supabase stack, covering tenant isolation on list/read, `due_date` recomputation on edit, `cumprido` excluding a deadline from future alert generation, and audit-log writes if this spec adds `deadlines` to the trigger scope (see Further Notes).
- **`deadlines-holiday-sync`**: integration test with a mocked FeriadosAPI response — asserts idempotent upsert (rerun produces no duplicates) and that a simulated API failure leaves existing `civil_holidays` rows untouched.
- **`deadlines-alerts`**: integration test against the local Supabase stack with the Resend HTTP call mocked at the boundary — asserts correct threshold detection (exactly 5/1 dias úteis, using known fixture holidays), the dedup unique constraint preventing a double-send on a simulated rerun, `cumprido` deadlines producing no alert, and tenant-scoped fan-out to the right set of recipient `user_id`s.
- **Listing/notification UI**: no prior art for component-level tests in this repo (same gap noted in `clients-catalog-matters-crud`) — verify by running the dev server: create deadlines with each `counting_mode`, confirm computed due dates, exercise the overdue/vence-em-breve highlighting, mark one `cumprido`, and check the in-app notification list/read-state golden path.

## Out of Scope

- The full "vence essa semana / vencido" dashboard/report screen — PLANNING §7 step 6, next after this.
- Per-tenant configurable alert thresholds or channels — MVP thresholds (5/1 dias úteis) and channels (e-mail/in-app) are fixed and global.
- An in-app forensic-holiday management/editor screen — `forensic_holidays` is seeded/maintained via SQL/seed script per PLANNING §8's annual manual process; add an editor later if curation volume demands it.
- Municipal/comarca-level holiday granularity and any tenant-level calendar override — PLANNING §4 explicitly scopes the MVP engine to national + state only.
- The WhatsApp notification channel — explicit PLANNING §5 post-MVP hook; `notifications.channel` is modeled to admit it later without a schema change.
- Targeting an alert at a specific "responsible" user rather than the whole tenant — no such field exists on `matters`/`deadlines` yet.
- A push alert for an already-overdue (vencido) deadline beyond the two fixed pre-due thresholds — the listing screen surfaces overdue state visually; no additional alert fires after `due_date` passes.
- Retroactively recomputing already-stored `due_date` values if `civil_holidays`/`forensic_holidays` data is corrected after the fact — accepted staleness for MVP.
- Any change to `postgres-schema-rls`, `tenants-auth-invite`, or `clients-catalog-matters-crud`'s own tickets beyond the `deadlines` column addendum called out above.

## Further Notes

- Depends on `postgres-schema-rls` (schema/RLS/`current_tenant_id()`, and `deadlines`/`deadline_tags` specifically from its ticket 03), `tenants-auth-invite` (`getCurrentUser()`/roster query), and `clients-catalog-matters-crud` (a real `matters` context to attach to) — none are built yet as of this spec (all `ready-for-agent`, code still stub).
- **Gap to resolve during ticket breakdown**: `postgres-schema-rls`/03 (`deadlines` table) predates this spec and only lists `matter_id`/`is_fatal`/`counting_mode`. Whoever breaks this spec into tickets needs to either amend ticket 03 directly (if still unbuilt at that point) to include `start_date`/`description`/`status`/`due_date`, or add a small follow-up migration ticket in this feature that adds them — don't let the four columns get lost between specs.
- **Gap worth flagging**: `postgres-schema-rls`/04 scopes the `audit_log` trigger to `clients`/`matters`/`payments` only — `deadlines` writes aren't captured. Given a fatal deadline's dates/status are legally significant, this is worth adding to the trigger scope (either by amending ticket 04 if unbuilt, or a small follow-up here) — not decided as in-scope above since it crosses into another feature's ticket, flagged here instead of silently expanded.
- **Glossary gap**: "motor de contagem" (counting engine), "alerta de prazo" (deadline alert), and the generic `notifications` channel model aren't yet defined in `CONTEXT.md` — worth a pass with `/domain-modeling` once this is built.
- No new ADR proposed here — the engine-purity seam and the fixed-threshold/no-per-tenant-config choice are implementation-level, consistent with existing PLANNING §4 decisions rather than new costly-to-reverse calls.
