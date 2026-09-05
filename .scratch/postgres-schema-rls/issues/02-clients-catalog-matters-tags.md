# 02: Clients + matter catalog + matters (rascunho lifecycle) + tags

**What to build:** `clients` (status `ativo`/`inativo`, `deleted_at`, `retention_until`), `matter_catalog_items` (per-tenant, replacing the hardcoded enum from `office_manager`), and `matters` (`client_id` nullable, catalog-item FK nullable, status `rascunho`/`em_andamento`/`concluido`/`arquivado`, `uf` not null, `comarca`/`municipio` nullable, `deleted_at`, `retention_until`) — plus `tags`/`matter_tags` ported from `office_manager`'s existing pattern. A table-level CHECK enforces ADR-0004: a matter may sit in `rascunho` with null `client_id`/catalog item, but promoting to `em_andamento` while either is null is rejected. A DB-level mechanism (RLS `DELETE` predicate or `BEFORE DELETE` trigger) rejects physical deletion of a `clients`/`matters` row while `retention_until` is in the future; soft-delete (`deleted_at`) remains a plain, ungated update. RLS enabled+forced on all four tables using `current_tenant_id()` from ticket 01.

**Blocked by:** 01 (tenant/user foundation + migration pipeline + RLS harness)

**Status:** done

- [x] `clients`, `matter_catalog_items`, `matters`, `tags`, `matter_tags` exist in `packages/db/schema.ts` with the columns above
- [x] `matters` CHECK: `status = 'rascunho' OR (client_id IS NOT NULL AND matter_catalog_item_id IS NOT NULL)` (ADR-0004)
- [x] Retention mechanism rejects physical delete on `clients`/`matters` while `retention_until` is future; succeeds once past
- [x] Soft-delete (`deleted_at`) update is not gated by retention
- [x] `matter_catalog_items` scoped per tenant (no shared/global catalog)
- [x] RLS enabled + forced on all five tables via `current_tenant_id()`
- [x] Test: same-tenant vs cross-tenant read/write on each of the five tables
- [x] Test: insert `matters` row with null `client_id`/catalog item in `rascunho` succeeds; attempted promotion to `em_andamento` with either still null is rejected
- [x] Test: delete blocked while `retention_until` future, succeeds once past

## Comments

Implemented: migrations `20260905023639_clients-catalog-matters-tags.sql` +
`..._rls.sql`. `clients` carries the full ManagerDesk-derived field set minus
accounting-specific columns (mei_type/nirf/cib/incra/etc., irrelevant to a law
office) plus the new juridical fields (rg/address/marital_status/profession/
opposing_party/power_of_attorney) per PLANNING §4 — `birth_date` is a plain
`date`, not a timestamptz (a calendar date shouldn't risk a timezone/DST day
shift). Retention delete-gate implemented as an RLS `DELETE` policy predicate
(not a trigger) — a null `retention_until` fails closed (treated as "not yet
computed", not "unrestricted"), a judgment call not spelled out in the ADRs.
`retention_until` is excluded from `clients`/`matters`' `UPDATE` column grant
(caught in review: an ordinary tenant-scoped `UPDATE` policy would otherwise
let any tenant member null/backdate it and immediately bypass the retention
gate). `matter_tags` carries its own `tenant_id` plus a composite FK against
`matters`/`tags`' `unique(id, tenant_id)`, and `matters.client_id`/
`matter_catalog_item_id` use the same composite-FK pattern against
`clients`/`matter_catalog_items` (also caught in review — a plain
single-column FK would have let a matter reference another tenant's client
or catalog item). `matter_tags`' RLS is select/insert/delete as three
separate policies, not one `for all` (which would silently also grant
update). Tests in `02-clients-catalog-matters-tags.test.ts`, 34/34 passing.
