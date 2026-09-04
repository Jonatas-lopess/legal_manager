# 03: Matters CRUD (rascunho lifecycle)

**What to build:** Full CRUD for `matters` — create in `rascunho` with `client_id`/catalog item null, edit core fields (client, catalog item, `uf` required + optional `comarca`/`municipio`, description), list/search filterable by status and client, soft-delete. `matters.service.ts` runs the same nullability check the DB `CHECK` constraint enforces (ADR-0004) before writing, so promoting `rascunho` → `em_andamento` with either field still null gets a clean validation error instead of a raw Postgres error; the DB check stays the actual source of truth. `concluido`/`arquivado` are freely settable with no extra gate. Every create/update/status-change/soft-delete writes an `audit_log` row. This ticket's matter detail view is the anchor tickets 04 and 05 attach their panels to.

**Blocked by:** 01 (Clients CRUD), 02 (Catalog CRUD)

**Status:** ready-for-agent

- [ ] Create matter in `rascunho` with null `client_id`/catalog item succeeds
- [ ] Service-layer promotion to `em_andamento` with either still null is rejected with a validation error (not a raw DB error); succeeds once both set
- [ ] List/search/filter by status and client, tenant-scoped; cross-tenant list/read returns nothing
- [ ] Edit core fields (client, catalog item, `uf`/`comarca`/`municipio`, description) after creation
- [ ] `concluido`/`arquivado` settable with no additional workflow gate
- [ ] Soft-delete mirrors clients' behavior (`deleted_at`, hidden from default list, fetchable by ID)
- [ ] Every create/update/status-change/soft-delete produces an `audit_log` row
- [ ] Test seam: `matters.service.ts` against real local Supabase stack (no mocked `supabase-js`)
