# 02: Catalog CRUD

**What to build:** CRUD for `matter_catalog_items`, scoped per tenant — create, rename, list, delete. Delete is rejected (no row removed, clear domain error surfaced) when the item is referenced by any matter (soft-deleted or not); rename is always allowed as the non-destructive alternative. No new schema column (no `active`/status flag) — the guard is a service-layer check.

**Blocked by:** `postgres-schema-rls` ticket 02 (`matter_catalog_items` table + RLS), `tenants-auth-invite` ticket 02 (session/route guard) — both external. Independent of ticket 01 (clients) — can build in parallel.

**Status:** ready-for-agent

- [ ] Create/rename catalog item succeeds, tenant-scoped
- [ ] List returns only the acting tenant's items; cross-tenant list returns nothing
- [ ] Delete succeeds when the item has no referencing matters
- [ ] Delete rejected with a clear error when at least one matter references the item; row not removed
- [ ] Test seam: `catalog.service.ts` against real local Supabase stack (no mocked `supabase-js`)
