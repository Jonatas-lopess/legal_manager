# 03: Deadlines CRUD + listing screen + tags

**What to build:** Fill in `apps/web/src/modules/deadlines/*` — create/edit a deadline (matter, `start_date`, `counting_mode`, `is_fatal`, `description`), `due_date` computed and stored via ticket 02's engine on create and on any edit that changes `start_date`/`counting_mode`/the matter's `uf`. Mark a deadline `cumprido`. Attach/view freeform tags (extends the `tags`/`deadline_tags` pattern), cosmetic only, never read by the engine (ADR-0003). Listing screen (`AppShell`/`TableCard` per PLANNING §2): filterable by matter and status, `is_fatal` badge, overdue/vence-em-breve visual highlighting computed client-side against the stored `due_date`. Open to all three roles (`admin`/`advogado`/`secretario` — PLANNING §8 matrix has no restriction on `deadlines`). `deadlines.repository.ts` resolves a matter's `uf` by calling `matters.service.ts`'s public interface, never `matters.repository.ts` directly.

**Blocked by:** 02 (counting engine + holiday resolution)

**Status:** ready-for-agent

- [ ] Create a deadline with matter, `start_date`, `counting_mode`, `is_fatal`, `description`; computed `due_date` shown immediately after saving
- [ ] Edit `start_date`/`counting_mode`/`description` after creation; `due_date` recomputed automatically on a change that affects it
- [ ] Mark a deadline `cumprido`
- [ ] Attach/view tags on a deadline; tagging never affects `due_date`/`is_fatal`/`counting_mode`
- [ ] All three roles (`admin`/`advogado`/`secretario`) have full CRUD — no role check rejects any deadline action
- [ ] Listing screen: filter by matter, filter by status; `is_fatal` badge; overdue/vence-em-breve highlighting
- [ ] Listing/read scoped strictly to the caller's own tenant (cross-tenant list/read returns nothing)
- [ ] Test: tenant isolation on list/read/write (same-tenant succeeds, cross-tenant returns nothing), mirroring the pattern from `clients-catalog-matters-crud`
- [ ] Test: `due_date` recomputation on an edit that changes `start_date`/`counting_mode`
- [ ] Test: `cumprido` status set/read correctly
- [ ] UI verified by running the dev server: create with each `counting_mode`, confirm computed due dates, exercise overdue/vence-em-breve highlighting, mark one `cumprido` (no automated component-test prior art in this repo, same gap noted in `clients-catalog-matters-crud`)
