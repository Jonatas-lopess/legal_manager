Status: ready-for-agent

# Postgres schema + RLS (MVP foundation)

## Problem Statement

Every module under `apps/web/src/modules/*` is an empty stub, and `packages/db/schema.ts` has no tables. Nothing else in the MVP — auth, client/matter CRUD, the deadline engine, reports — can be built until a real multi-tenant Postgres schema exists. And it isn't just a build-order problem: escritórios (tenants) need their clients', matters', and deadlines' data to be provably invisible to every other tenant sharing the platform, even if a future bug ships in application code, because of sigilo profissional (Estatuto da OAB art. 7º/34) and LGPD obligations already discussed for this product. Nothing about that isolation can depend on every future engineer remembering to filter by `tenant_id` correctly in every query — it has to hold at the database level.

## Solution

Define the MVP's physical schema in `packages/db/schema.ts` (Drizzle, `pg-core`) for all entities in `PLANNING.md` §4, generate migrations via `drizzle-kit`, and apply them through the Supabase CLI. Enable Postgres RLS on every tenant-scoped table, resolving the acting tenant through a `SECURITY DEFINER` helper function that looks up `tenant_id` from `public.users` by `auth.uid()` (ADR-0005) — not the `current_setting('app.tenant_id')` session variable PLANNING.md originally described, which doesn't work in an architecture with no backend to set it.

Beyond isolation, the schema encodes — as real constraints, not app-layer validation — every schema-shaping decision made in this planning round: `matters.status` allows `rascunho` with a nullable `client_id`/catalog item, and blocks promotion to `em_andamento` while either is null (ADR-0004); `matters` carries `uf`/`comarca`/`municipio` for the deadline engine's holiday lookup, never `clients` (ADR-0002); `deadlines` carries `is_fatal`/`counting_mode` as plain columns the engine will read directly, with freeform labeling handled by extending the existing `tags` pattern (ADR-0003); `clients`/`matters` carry `deleted_at` + `retention_until`, with physical deletion blocked before the retention floor (LGPD retention decision, this session).

## User Stories

1. As an advogado at Tenant A, I want Tenant B's clients/matters/deadlines to be invisible to me at the database level, so that a bug in application code can never leak another escritório's confidential case data.
2. As an admin, I want every table holding tenant data to carry a `tenant_id` and an enforced RLS policy, so that isolation isn't optional per table.
3. As a developer, I want `tenant_id` resolved via a DB-side lookup (`auth.uid()` → `users.tenant_id`), not a client-supplied value, so a buggy or malicious request can't spoof a different tenant.
4. As an admin, I want `matter_catalog_items` scoped per tenant, so each escritório defines its own catalog instead of a hardcoded enum.
5. As an advogado, I want to start a matter before picking the client or catalog item (status `rascunho`), so I can begin drafting without the database rejecting an incomplete record.
6. As an advogado, I want the database to refuse promoting a `rascunho` matter to `em_andamento` while `client_id` or the catalog item is still null, so incomplete matters can't silently reach an active state.
7. As an advogado, I want every matter to require a `uf`, and optionally a `comarca`/`municipio`, so the deadline engine always has a jurisdiction to resolve the right forensic-holiday calendar against (the engine itself is a later spec — this just lays the columns down).
8. As an advogado, I want each deadline to carry its own `is_fatal` flag and `counting_mode` (`dias_uteis`/`dias_corridos`), so the future counting engine has reliable, non-freeform fields to read.
9. As an advogado, I want to attach freeform tags to a deadline the same way I already tag matters, so I can label/filter/report on deadlines without those labels ever affecting how they're counted.
10. As an admin, I want a `payments` table with a fixed value and `pago`/`pendente` status per matter, so the simple MVP financial tracking has somewhere to live.
11. As an admin, I want every write to `clients`/`matters`/`payments` captured in `audit_log` with the acting `user_id`, so the platform can demonstrate accountability under LGPD/OAB sigilo profissional obligations.
12. As a tenant (data controller), I want `clients`/`matters` to support soft-delete (`deleted_at`) instead of hard delete, so records aren't destroyed by mistake and stay recoverable.
13. As a compliance-conscious admin, I want the database to refuse a physical delete of a client/matter before its `retention_until` date, so data can't be destroyed before the applicable prescricional period, even by operator error or a future bulk-cleanup script.
14. As a developer, I want `packages/db/schema.ts` to stay the single source of truth for the physical schema, so no other file in the monorepo duplicates a table definition.
15. As a developer, I want migrations generated via `drizzle-kit` from that schema and applied through the Supabase CLI, so schema changes are reviewable as code and reproducible across environments.
16. As a developer, I want an integration suite that runs migrations against a real disposable Postgres instance and asserts on RLS/constraint behavior as different simulated tenants/users, so isolation and constraint guarantees are verified against real Postgres semantics, not a mock.
17. As an admin, I want `users.role` restricted to `admin`/`advogado`/`secretario` for the MVP, with `tenant_id` required, so every user is unambiguously scoped to exactly one escritório.
18. As an admin, I want `current_tenant_id()` to read live from `users`, so a user's effective tenant is never a stale cached value.

## Implementation Decisions

- **Modules**: `packages/db/schema.ts` (Drizzle `pg-core` table definitions for all entities below), `packages/schema` (Zod validators mirroring the physical schema, `drizzle-zod` pattern per PLANNING §2), Supabase migrations (drizzle-kit-generated SQL, plus RLS policy/function statements alongside).
- **Tables**: `tenants`, `users` (`tenant_id` FK not null, `role` enum `admin`/`advogado`/`secretario`), `clients` (`status` enum `ativo`/`inativo`, `deleted_at`, `retention_until`), `matter_catalog_items`, `matters` (`client_id` nullable, catalog-item FK nullable, `status` enum `rascunho`/`em_andamento`/`concluido`/`arquivado`, `uf` not null, `comarca`/`municipio` nullable, `deleted_at`, `retention_until`), `deadlines` (`matter_id` FK, `is_fatal` bool, `counting_mode` enum `dias_uteis`/`dias_corridos`), `payments` (`matter_id` FK, fixed value, `status` enum `pago`/`pendente`), `tags`, `matter_tags` (join), `deadline_tags` (join, new — extends the existing tag pattern to deadlines), `audit_log` (`user_id`, `tenant_id`, action/entity/entity_id).
- **Tenant resolution**: a `SECURITY DEFINER`, `STABLE` SQL function reads `tenant_id` from `public.users` by `auth.uid()`; every tenant-scoped table's RLS policies compare `tenant_id = current_tenant_id()` (ADR-0005). RLS is enabled and forced on every tenant-scoped table.
- **`rascunho` constraint**: a table-level `CHECK` (or equivalent) on `matters` — `status = 'rascunho' OR (client_id IS NOT NULL AND matter_catalog_item_id IS NOT NULL)` (ADR-0004).
- **Retention enforcement**: DB-level mechanism (an RLS `DELETE` policy predicate on `retention_until`, or a `BEFORE DELETE` trigger — implementer's choice) that rejects a physical delete on `clients`/`matters` while `retention_until` is in the future. Soft-delete (`deleted_at`) is a plain update, not gated.
- **Migration tooling**: `drizzle-kit generate` from `packages/db/schema.ts`, applied via the Supabase CLI — decided this session, resolving PLANNING §6's open item.
- No application/service/repository code is written as part of this spec — see Out of Scope.

## Testing Decisions

- A good test here exercises real Postgres behavior — what a query actually returns or rejects under RLS and constraints — never a mocked query builder. There's no repository/service code yet to test at that layer; the schema and its policies/functions are the unit under test.
- Run migrations against a real, disposable Postgres instance (Testcontainers or the local Supabase stack — implementer's choice of harness; requirement is "real Postgres," not "mocked").
- Coverage, per tenant-scoped table: a same-tenant case (read/write succeeds) and a cross-tenant case (read/write returns zero rows or is rejected) as different simulated `auth.uid()` values.
- A `rascunho` case: insert with null `client_id`/catalog item succeeds; attempting to set `status = 'em_andamento'` while either is still null is rejected.
- A retention case: delete attempt on a row with a future `retention_until` is rejected; the same delete succeeds once `retention_until` is in the past.
- No prior art in this repo — this is the first test suite written against it. The sibling `office_manager` (ManagerDesk) project isn't useful prior art here: it's single-tenant local SQLite with no RLS equivalent.

## Out of Scope

- Any application/service/repository code in `apps/web/src/modules/*` — this spec is schema + RLS only.
- Auth signup/invite flow and role-based UI permission checks beyond the `role` column existing (PLANNING §7 step 3).
- The deadline counting engine itself (business-day math, forensic-holiday data source integration) — only the `is_fatal`/`counting_mode`/`uf`/`comarca` columns it will read.
- The full RBAC permission matrix and custom-roles-per-tenant (still open, PLANNING §5/§8).
- Self-service data-subject-rights UI (explicitly deferred this session).
- Payment webhook / billing integration (deferred out of MVP).
- The `documents` entity (out of MVP schema per PLANNING §5).

## Further Notes

- Decisions here are recorded as ADR-0001 through ADR-0005 in `docs/adr/` and in `CONTEXT.md` — read those before implementing.
- This repo's issue-tracker setup is incomplete: `docs/agents/issue-tracker.md` references a `triage-labels.md` that doesn't exist, and no `.scratch/` directory existed before this spec. Run `/setup-matt-pocock-skills` to fill in the full label vocabulary before further specs need triage beyond `ready-for-agent`.
- `packages/db/schema.ts` and every `apps/web/src/modules/*/*.schema.ts` are currently empty stubs (`export {}`) — this is the first spec expected to give `packages/db/schema.ts` real content.
