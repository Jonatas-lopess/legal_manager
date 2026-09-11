# 03: Prazos page

**What to build:** `/dashboard/prazos` — headline count of `deadlines` where `status = pendente` and due within the alert window (5 dias úteis) or already overdue, followed by the same set grouped into **vencido / hoje / próximos**. Each row shows matter (client + catalog item), descrição, due date, an overdue/vence-em-breve badge, and the `is_fatal` flag. The headline/list computation delegates to `deadlines.service.ts`'s existing public overdue/vence-em-breve comparison (built in `deadlines-engine-alerts`) — `reports.repository.ts` does not reimplement it or reach `deadlines.repository.ts` directly, same cross-context rule `01` follows for `clients`/`matters`/`payments`. A "Ver todos os prazos catalogados" link goes to the existing `deadlines` listing screen. No período selector on this page — it's forward-looking, not a historical bucket.

**Blocked by:** `01` (needs the nav shell; the "Prazos" nav link becomes a real page)

**Status:** done

- [x] Headline count matches `deadlines` where `status = pendente` and (due within 5 dias úteis OR overdue)
- [x] List below is grouped vencido / hoje / próximos; each row shows matter (client + catalog item), descrição, due date, overdue/vence-em-breve badge, `is_fatal` flag
- [x] "Ver todos os prazos catalogados" link navigates to the existing deadlines listing screen
- [x] No período selector rendered on this page
- [x] No RBAC gating on this page (no `payments` data involved)
- [x] Loading skeleton while the query resolves; zero-data tenant renders an empty headline/list, not broken
- [x] Test asserts the headline/list computation calls `deadlines.service.ts`'s existing overdue/vence-em-breve function rather than reimplementing the comparison (regression guard against silently diverging from the `deadlines` listing screen's own count)

## Comments

Implemented alongside `01`/`02`/`04` in one pass — see `01`'s Comments for the full implementation summary, verification, and the 2026-09-11 code-review pass. `deadlines.service.ts`'s private vencido/vence-em-breve heuristic was extracted to an exported `dueDateHighlight` (re-exported via `deadlines.controller.ts`) specifically so this ticket's `getPrazosCriticos` could delegate to it rather than reimplement, per this ticket's own regression-guard requirement — `reports.prazos.test.ts` asserts that delegation directly. Non-blocking follow-up noted in `01`'s Comments: `getPrazosCriticos` fetches the tenant's entire `matters`/`clients`/`catalog_items` tables to resolve row labels rather than only the referenced subset.
