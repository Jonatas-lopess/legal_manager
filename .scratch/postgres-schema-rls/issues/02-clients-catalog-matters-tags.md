# 02: Clients + matter catalog + matters (rascunho lifecycle) + tags

**What to build:** `clients` (status `ativo`/`inativo`, `deleted_at`, `retention_until`), `matter_catalog_items` (per-tenant, replacing the hardcoded enum from `office_manager`), and `matters` (`client_id` nullable, catalog-item FK nullable, status `rascunho`/`em_andamento`/`concluido`/`arquivado`, `uf` not null, `comarca`/`municipio` nullable, `deleted_at`, `retention_until`) — plus `tags`/`matter_tags` ported from `office_manager`'s existing pattern. A table-level CHECK enforces ADR-0004: a matter may sit in `rascunho` with null `client_id`/catalog item, but promoting to `em_andamento` while either is null is rejected. A DB-level mechanism (RLS `DELETE` predicate or `BEFORE DELETE` trigger) rejects physical deletion of a `clients`/`matters` row while `retention_until` is in the future; soft-delete (`deleted_at`) remains a plain, ungated update. RLS enabled+forced on all four tables using `current_tenant_id()` from ticket 01.

**Blocked by:** 01 (tenant/user foundation + migration pipeline + RLS harness)

**Status:** ready-for-agent

- [ ] `clients`, `matter_catalog_items`, `matters`, `tags`, `matter_tags` exist in `packages/db/schema.ts` with the columns above
- [ ] `matters` CHECK: `status = 'rascunho' OR (client_id IS NOT NULL AND matter_catalog_item_id IS NOT NULL)` (ADR-0004)
- [ ] Retention mechanism rejects physical delete on `clients`/`matters` while `retention_until` is future; succeeds once past
- [ ] Soft-delete (`deleted_at`) update is not gated by retention
- [ ] `matter_catalog_items` scoped per tenant (no shared/global catalog)
- [ ] RLS enabled + forced on all five tables via `current_tenant_id()`
- [ ] Test: same-tenant vs cross-tenant read/write on each of the five tables
- [ ] Test: insert `matters` row with null `client_id`/catalog item in `rascunho` succeeds; attempted promotion to `em_andamento` with either still null is rejected
- [ ] Test: delete blocked while `retention_until` future, succeeds once past
