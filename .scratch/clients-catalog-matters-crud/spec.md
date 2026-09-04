Status: ready-for-agent

# Clients + matter catalog + matters CRUD (PLANNING §7 step 4)

## Problem Statement

The schema exists on paper (`postgres-schema-rls`, ready-for-agent) and a session will soon be able to log in with a known `tenant_id`/`role` (`tenants-auth-invite`, ready-for-agent) — but there is still no way for anyone at an escritório to actually record a client, define their own catalog of service types, or open a matter. Every module under `apps/web/src/modules/{clients,catalog,matters,tags,payments}` is still an empty `export {}` stub. Without this, the deadline engine (the product's real differentiator, PLANNING §1) has nothing to attach a `deadline` to — a `matter` is its required parent — so this is the last generic-CRUD layer blocking the differentiator.

## Solution

Build real CRUD for three bounded contexts — `clients`, `catalog` (`matter_catalog_items`), `matters` — following the vertical-slice convention already fixed in PLANNING §6 (`*.controller.ts` / `*.service.ts` / `*.repository.ts` / `*.schema.ts` per context, `repository.ts` the only file touching `supabase-js`). Two supporting contexts are brought along because `matters` cannot be used without them: `tags` gets minimal CRUD plus the `matter_tags` attach/detach it already owns per the domain glossary, and `payments` gets the simplified (no ledger math) recording flow PLANNING §4 already scoped down to "valor fixo + status pago/pendente". Both are reached from the matter detail view by `matters` calling their public `service.ts`, never their `repository.ts` (PLANNING §6 cross-context rule).

This is also the first spec to actually enforce the PLANNING §8 role matrix in code — `postgres-schema-rls` and `tenants-auth-invite` both explicitly deferred "per-module CRUD permission enforcement" to whichever spec built each module. This one does, for the modules it touches: `payments` actions are rejected in `payments.service.ts` for `secretario` (the one row in the matrix that's more restrictive than the others), everything else in scope is open to all three roles.

Ported from `office_manager`: `service-dialog.tsx`'s form architecture (react-hook-form + `zodResolver`, masks) for the `ClientDialog`/`MatterDialog`, and `financial-dialog.tsx`'s panel-in-a-detail-view pattern for payments — simplified, since the new `payments` schema has no per-payment ledger balance to compute (PLANNING §4: "sem split").

## User Stories

**Clients**
1. As an advogado, I want to create a client with the fields ManagerDesk already tracks plus the new juridical ones (RG, endereço, estado civil, profissão, parte contrária, dados de procuração), so I have a complete client record from day one.
2. As an advogado, I want CPF/CNPJ fields masked and validated the same way ManagerDesk does, so data entry stays consistent with what the team already knows.
3. As any tenant member, I want to list and search my tenant's clients only, so I never see another escritório's clients even by URL/ID guessing.
4. As any tenant member, I want to filter clients by `ativo`/`inativo` status, so I can focus on the active roster.
5. As any tenant member, I want to edit an existing client's fields, so records stay current.
6. As any tenant member, I want to "delete" a client to actually soft-delete it (`deleted_at`), so the record survives for retention/audit purposes and can't be destroyed by a misclick.
7. As any tenant member, I want a soft-deleted client hidden from the default list but still resolvable by ID (e.g., from an existing matter), so historical matters don't break.
8. As any tenant member, I want every client create/update/soft-delete to land in `audit_log` with my `user_id`, so the accountability guarantee from `postgres-schema-rls` is actually exercised, not just possible.

**Catalog**
9. As any tenant member, I want to create a custom catalog item (a service type specific to my escritório), so matters aren't limited to a hardcoded enum.
10. As any tenant member, I want to rename an existing catalog item, so a typo or renamed service type doesn't require deleting and recreating it (and orphaning matters that reference it).
11. As any tenant member, I want to list only my tenant's catalog items, so the catalog is genuinely per-tenant, not shared/global.
12. As any tenant member, I want deleting a catalog item that's still referenced by at least one matter to be rejected with a clear reason, so I can't silently break an existing matter's reference.
13. As any tenant member, I want to delete a catalog item that has no matters referencing it, so an unused/mistaken entry doesn't clutter the list forever.

**Matters**
14. As an advogado, I want to start a matter in `rascunho` with no client and no catalog item chosen yet, so I can begin drafting before those decisions are made.
15. As an advogado, I want the UI to block (with a clear message) promoting a `rascunho` matter to `em_andamento` while `client_id` or the catalog item is still empty, so I get the feedback before the database rejects the write.
16. As an advogado, I want the matter form to require `uf` and accept optional `comarca`/`municipio`, so the deadline engine (future spec) always has a jurisdiction to key off of.
17. As any tenant member, I want to list and search my tenant's matters, filterable by status (`rascunho`/`em_andamento`/`concluido`/`arquivado`) and by client, so I can find a specific matter quickly.
18. As any tenant member, I want to set a matter's status to `concluido` or `arquivado`, so its lifecycle reflects reality — with no extra workflow gate beyond the `rascunho` → `em_andamento` one already enforced by the schema.
19. As any tenant member, I want to edit a matter's core fields (client, catalog item, location, description) after creation, so mistakes and updates don't require recreating the matter.
20. As any tenant member, I want to soft-delete a matter, mirroring the client soft-delete behavior, so matters are also recoverable and retention-safe.
21. As any tenant member, I want every matter create/update/status-change/soft-delete captured in `audit_log`, so matter history is auditable the same way client history is.
22. As any tenant member, I want to open a matter and see all of its attached tags, add a new tag inline, or pick from existing tags, so I can label/filter matters without leaving the matter view.
23. As any tenant member, I want to remove a tag from a matter without deleting the tag itself (other matters may still use it), so tag removal is per-matter, not global.

**Tags**
24. As any tenant member, I want to create a tag with a name and color the first time I need it (from the matter tag picker), so I don't need a separate "manage tags" trip just to add one.
25. As any tenant member, I want to rename or recolor an existing tag, so a tag I created can be corrected without recreating every matter's attachment to it.
26. As any tenant member, I want to delete a tag entirely, which also removes it from every matter that had it attached, so a mistaken or obsolete tag doesn't linger.
27. As any tenant member, I want tags scoped to my tenant only, so I never see or attach another tenant's tags.

**Payments (matter-scoped)**
28. As an admin or advogado, I want to record a payment against a matter with a fixed value and a `pago`/`pendente` status, so the simple MVP financial tracking (PLANNING §4) has somewhere to go.
29. As an admin or advogado, I want to see the list of payments recorded against a matter, so I know its financial state at a glance.
30. As an admin or advogado, I want to toggle a payment's status between `pago` and `pendente`, so marking an invoice paid doesn't require deleting and recreating the record.
31. As a secretario, I want any attempt to view, create, or change a payment rejected, so the PLANNING §8 role matrix (no `payments` access for `secretario`) is actually enforced, not just documented.
32. As an admin or advogado, I want every payment create/status-change captured in `audit_log`, so financial changes are auditable like everything else.

## Implementation Decisions

- **Modules**: fill in `apps/web/src/modules/{clients,catalog,matters,tags,payments}/*` per the existing stub layout — `*.repository.ts` (only file per context using `supabase-js`/`.from(...)`), `*.service.ts` (business rules, the test seam — see Testing Decisions), `*.controller.ts` (UI-facing orchestration), `*.schema.ts` (re-export/refine `packages/schema` Zod shapes), `components/` (dialogs/tables specific to the context). `packages/schema` gains the Zod input/output shapes shared by web and (later) any Edge Function.
- **Cross-context calls**: `matters` reaches `tags` and `payments` only through their public `service.ts` (never their `repository.ts`), per PLANNING §6. `catalog`'s reference-check (story 12) is a query `catalog.service.ts` runs against matters — implementer's choice of whether that's a direct count query in `catalog.repository.ts` filtering on `matter_catalog_item_id`, or a call out to `matters.service.ts`; either keeps the no-cross-repository rule intact.
- **Role gating (new — first spec to enforce PLANNING §8 in code)**: `clients`, `catalog`, and `matters` CRUD is open to all three roles (`admin`/`advogado`/`secretario`) — PLANNING §8's matrix lists all three as having CRUD on clients/matters, and catalog management isn't called out as restricted, so it follows the same access as matters. `payments.service.ts` rejects every action for `secretario` (matrix: `secretario` has no `payments` access) by checking the caller's role via `tenants.service.ts`'s `getCurrentUser()` (built in `tenants-auth-invite`) — enforced server-side in the service layer, not just hidden in the UI, matching how the invite Edge Function's `admin`-only check was enforced in that spec.
- **Rascunho promotion**: `matters.service.ts` runs the same nullability check the database CHECK constraint already enforces (ADR-0004) before issuing the update, so the UI gets a clean validation error instead of surfacing a raw Postgres constraint violation — the DB check remains the actual source of truth; this is a UX pre-check, not a replacement.
- **Soft-delete only**: "delete" in the UI for `clients` and `matters` always sets `deleted_at`; no UI path issues a physical `DELETE` on either table in this spec (retention enforcement from `postgres-schema-rls` would reject most of those anyway while `retention_until` is future). Default list queries in both `*.repository.ts` filter out rows with `deleted_at IS NOT NULL`; a matter's own client, if soft-deleted, is still fetched by ID for display.
- **Catalog delete guard**: `catalog.service.ts` rejects deleting a `matter_catalog_items` row referenced by any matter (soft-deleted or not) with a domain error the UI surfaces as a message — no schema change (no new `active`/status column) needed; rename remains always allowed as the non-destructive alternative to "retiring" an item.
- **Payments model simplification vs. `office_manager`**: no partial-payment ledger, no running balance/`totalPaid` computation like `financial-dialog.tsx` did — PLANNING §4 explicitly dropped that ("sem split"). The matter detail view's payments panel is a plain list of fixed-value/status records with create + status-toggle, not a balance calculator. Treat this as an intentional simplification of the ported pattern, not a follow-up to add balance math back in.
- **Tag deletion cascade**: deleting a tag removes its `matter_tags` rows too (matches story 26) — implementer's choice of `ON DELETE CASCADE` at the FK (if not already set by `postgres-schema-rls`'s `matter_tags` definition) vs. an explicit delete in `tags.service.ts`; either is acceptable as long as no orphaned `matter_tags` row survives a tag delete.
- **Audit logging**: every mutating call in `clients.service.ts`, `matters.service.ts`, and `payments.service.ts` writes an `audit_log` row (`user_id`, `tenant_id`, action, entity, entity_id) — reuses the `audit` bounded context's existing stub rather than each module writing `audit_log` directly, keeping `audit_log` writes behind one repository the way `postgres-schema-rls` intended.
- **UI**: `ClientDialog` and `MatterDialog` port `service-dialog.tsx`'s react-hook-form + `zodResolver` + BR masks (`lib/masks.ts`) architecture. Matter detail view is tabbed/sectioned: core fields, tags (story 22/23), payments (story 28-30, hidden entirely for `secretario`). Catalog management is a lightweight list+dialog reachable from the matters area, not a top-level nav item — it's configuration in service of creating matters, not its own product surface. `AppShell`/`StatusBadge`/`DebouncedSearch`/`InfiniteList` from `panel-kit.tsx` are reused for all three list views (clients, matters, catalog) per PLANNING §2.

## Testing Decisions

- Same seam convention as `postgres-schema-rls` and `tenants-auth-invite`: each context's `*.service.ts` is the unit under test, exercised against a real local Supabase stack (Postgres + PostgREST + RLS), never a mocked `supabase-js` client — reuse that harness setup directly rather than inventing a third one.
- A good test here exercises the *service's* observable behavior (what it returns, rejects, or writes to `audit_log`/the DB) — not which internal query builder method it called.
- **Coverage — clients**: create/edit/soft-delete succeed and are visible only within the acting tenant (cross-tenant list/read returns nothing, mirroring the RLS test pattern from `postgres-schema-rls`); soft-deleted client excluded from default list but still fetchable by ID; every mutation produces an `audit_log` row.
- **Coverage — catalog**: create/rename succeed and are tenant-scoped; delete succeeds when unreferenced; delete rejected (with no row removed) when a matter references the item.
- **Coverage — matters**: `rascunho` create with null `client_id`/catalog item succeeds; `service.ts`-level promotion to `em_andamento` with either still null is rejected with a validation error (not a raw DB error); promotion succeeds once both are set; tenant isolation on list/read; soft-delete behavior mirrors clients; audit log written on mutations.
- **Coverage — tags**: create/rename/delete tenant-scoped; deleting a tag removes its `matter_tags` rows (attaching that same tag name again after delete does not resurrect old attachments); attach/detach a tag to/from a matter reflected in that matter's tag list; cross-tenant tag list returns nothing.
- **Coverage — payments**: `admin`/`advogado` can create a payment and toggle its status, both scoped to the correct matter/tenant; `secretario` attempting any of create/list/status-toggle is rejected; audit log written on create/status-change.
- UI components (dialogs, tables) are not covered by this automated suite — there's no prior art for component-level tests in this repo (ManagerDesk has none either); verify them by running the dev server and exercising the golden path (create → edit → tag → soft-delete, per module) plus the `secretario`-cannot-see-payments case, before calling this done.

## Out of Scope

- The `deadlines` module and the counting engine itself — PLANNING §7 step 5, next after this.
- Reports/dashboard (PLANNING §7 step 6) — this spec only produces the CRUD the reports will later read.
- CSV import of an existing client roster (`csv-import-dialog.tsx` in PLANNING §2's reuse table) — not named in PLANNING §7 step 4's explicit port list; worth its own spec once clients CRUD exists to import into.
- Any workflow gate on `concluido`/`arquivado` transitions beyond what already exists — any authorized role can set either status freely in the MVP.
- Full payment ledger / partial-payment balance math, split payments, timesheet-by-hour, honorário de êxito — all explicitly deferred by PLANNING §4/§5.
- Catalog item categories, hierarchies, or any per-catalog-item metadata beyond a name.
- Custom-roles-per-tenant (PLANNING §5/§8, still an open decision) — role gating here is hardcoded to the fixed three-role matrix.
- Client/matter document attachments — out of MVP schema entirely (PLANNING §5).
- Any change to `postgres-schema-rls` or `tenants-auth-invite`'s own tickets — this spec assumes both are implemented exactly as specced there.

## Further Notes

- Depends on `postgres-schema-rls` (schema + RLS + `current_tenant_id()`) and `tenants-auth-invite` (`tenants.service.ts`'s `getCurrentUser()` for role/tenant lookup, route guard) being implemented first — neither has been built yet as of this spec (both are `ready-for-agent`, code is still stub `export {}` files).
- This is the first spec to enforce a role restriction narrower than "authenticated in this tenant" — both prior specs explicitly punted that to "each module's own spec." The `payments`/`secretario` rule here is the precedent for how future modules should enforce their own row in the PLANNING §8 matrix (check role in `service.ts`, not just hide UI).
- No new ADR is proposed by this spec — the role-gating and catalog-delete-guard decisions above are implementation-level, not the kind of costly-to-reverse architectural call `docs/adr/` exists for.
