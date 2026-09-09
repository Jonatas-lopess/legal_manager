# 03: Deadlines CRUD + listing screen + tags

**What to build:** Fill in `apps/web/src/modules/deadlines/*` — create/edit a deadline (matter, `start_date`, `counting_mode`, `is_fatal`, `description`), `due_date` computed and stored via ticket 02's engine on create and on any edit that changes `start_date`/`counting_mode`/the matter's `uf`. Mark a deadline `cumprido`. Attach/view freeform tags (extends the `tags`/`deadline_tags` pattern), cosmetic only, never read by the engine (ADR-0003). Listing screen (`AppShell`/`TableCard` per PLANNING §2): filterable by matter and status, `is_fatal` badge, overdue/vence-em-breve visual highlighting computed client-side against the stored `due_date`. Open to all three roles (`admin`/`advogado`/`secretario` — PLANNING §8 matrix has no restriction on `deadlines`). `deadlines.repository.ts` resolves a matter's `uf` by calling `matters.service.ts`'s public interface, never `matters.repository.ts` directly.

**Blocked by:** 02 (counting engine + holiday resolution)

**Status:** done

- [x] Create a deadline with matter, `start_date`, `counting_mode`, `is_fatal`, `description`; computed `due_date` shown immediately after saving
- [x] Edit `start_date`/`counting_mode`/`description` after creation; `due_date` recomputed automatically on a change that affects it
- [x] Mark a deadline `cumprido`
- [x] Attach/view tags on a deadline; tagging never affects `due_date`/`is_fatal`/`counting_mode`
- [x] All three roles (`admin`/`advogado`/`secretario`) have full CRUD — no role check rejects any deadline action
- [x] Listing screen: filter by matter, filter by status; `is_fatal` badge; overdue/vence-em-breve highlighting
- [x] Listing/read scoped strictly to the caller's own tenant (cross-tenant list/read returns nothing)
- [x] Test: tenant isolation on list/read/write (same-tenant succeeds, cross-tenant returns nothing), mirroring the pattern from `clients-catalog-matters-crud`
- [x] Test: `due_date` recomputation on an edit that changes `start_date`/`counting_mode`
- [x] Test: `cumprido` status set/read correctly
- [x] UI verified by running the dev server (see Comments — no browser/screenshot tool available, boot-only verification)

## Comments

Implemented: `packages/schema/src/index.ts` (`createDeadlineInputSchema`/`updateDeadlineInputSchema`, `countingModes`/`deadlineStatuses`), `deadlines.schema.ts`/`deadlines.repository.ts`/`deadlines.service.ts`/`deadlines.controller.ts` filled in (CRUD layered around ticket 02's `computeDueDate`/`resolveNonBusinessDates`, untouched), `tags` module extended with deadline-tag functions mirroring the matter-tag ones, `DeadlineDialog.tsx`/`DeadlinesTable.tsx`/`DeadlineTagPicker.tsx`, route wired in `App.tsx`. Tests: `deadlines.crud.test.ts` (9 cases: tenant isolation, due_date recompute on start_date/counting_mode change, no-recompute on unrelated edit, cumprido + filtered listing, all-three-roles access, tag attach/detach not affecting engine fields).

Full `apps/web` suite: 61/61 passing. `tsc --noEmit` clean. Repo-wide `pnpm lint` clean (one unused-var error in the unrelated ticket-04 Edge Function's `index.ts` fixed directly afterward).

**UI verification**: the implementing agent had no browser/screenshot tool available — boot-only verification performed (dev server + typecheck + lint), not a real click-through. Flagging per this repo's own house rule rather than claiming more than was done.

**Note**: the agent run that built this ticket was cut off by a session rate limit right after typecheck (mid-lint); resumed and finished verification directly rather than re-running the whole agent.

**Code-review pass (2026-09-09) on the whole finished `deadlines-engine-alerts` feature** found one confirmed bug here (fixed): `DeadlineDialog` was sending every field on every edit, not just changed ones — could silently shift `due_date` on an unrelated edit if holidays changed since creation; now diffs `dirtyFields`, regression test added. Findings left as documented, non-blocking follow-ups (efficiency/duplication, not correctness, spanning tickets 02/04/05): the business-day/holiday engine is duplicated between `apps/web/src/modules/deadlines/deadlines.service.ts` and `supabase/functions/deadlines-alerts/service.ts` (no cross-app shared-package precedent existed to avoid it); `deadlines-alerts` resolves holidays per-candidate instead of batched per `uf`; `deadlines-holiday-sync` fetches its 56 jurisdiction×year combinations sequentially instead of concurrently; a `notifications` row stuck in `status: 'failed'` blocks a retry on a later day (the dedup unique constraint doesn't distinguish "already sent" from "already tried and failed").
