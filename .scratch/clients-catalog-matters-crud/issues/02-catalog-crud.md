# 02: Catalog CRUD

**What to build:** CRUD for `matter_catalog_items`, scoped per tenant — create, rename, list, delete. Delete is rejected (no row removed, clear domain error surfaced) when the item is referenced by any matter (soft-deleted or not); rename is always allowed as the non-destructive alternative. No new schema column (no `active`/status flag) — the guard is a service-layer check.

**Blocked by:** `postgres-schema-rls` ticket 02 (`matter_catalog_items` table + RLS), `tenants-auth-invite` ticket 02 (session/route guard) — both external. Independent of ticket 01 (clients) — can build in parallel.

**Status:** done

- [x] Create/rename catalog item succeeds, tenant-scoped
- [x] List returns only the acting tenant's items; cross-tenant list returns nothing
- [x] Delete succeeds when the item has no referencing matters
- [x] Delete rejected with a clear error when at least one matter references the item; row not removed
- [x] Test seam: `catalog.service.ts` against real local Supabase stack (no mocked `supabase-js`)

## Comments

Implemented as specced. Notes for ticket 03 (`matters`), which will inherit these:

- **Delete guard is a direct query, not a call to `matters.service.ts`.** The `matters` module doesn't exist yet (still stub), so `catalog.repository.ts` counts referencing rows straight off the `matters` table (`matter_catalog_item_id` eq, no `deleted_at` filter — soft-deleted matters still block delete per spec). This is one of the two options the spec explicitly sanctioned; RLS already scopes the count to the caller's tenant so no cross-tenant leak.
- **No audit trigger on `matter_catalog_items`** (confirmed in ticket 01's comments, re-confirmed here) — `catalog.service.ts` doesn't write `audit_log`, matching the spec (audit logging wasn't asked for on this context).
- **No UI built.** Unlike ticket 01, this ticket's "what to build" line never mentioned a dialog/table, and the parent spec places catalog management "reachable from the matters area" — which doesn't exist until ticket 03. `components/.gitkeep` left untouched; a lightweight list+dialog is ticket 03's or a follow-up's job once there's a host page to reach it from.
- Test seam inserts the referencing `matters` row with a raw `db.query` (bypassing RLS via the harness's superuser pool), same pattern ticket 01's audit test used for `audit_log`/`users` — the only way to test the guard before the `matters` module exists.
