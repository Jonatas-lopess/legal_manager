# 01: Tenant/user foundation + migration pipeline + RLS proof harness

**What to build:** `packages/db/schema.ts` gains real `tenants` and `users` tables (`role` enum: `admin`/`advogado`/`secretario`, `tenant_id` FK not null on `users`). A `current_tenant_id()` SECURITY DEFINER, STABLE SQL function resolves the acting tenant by looking up `auth.uid()` in `public.users` (ADR-0005). RLS is enabled and forced on both tables, policies compare `tenant_id = current_tenant_id()`. The `drizzle-kit generate` → Supabase CLI migration pipeline is wired up end to end (resolves PLANNING §6's open tooling item). An integration test suite runs migrations against a real disposable Postgres instance (Testcontainers or local Supabase stack) and proves, as different simulated `auth.uid()` values, that one tenant cannot see another tenant's `users` rows.

This is the foundation ticket: every other ticket in this repo — the rest of this spec and all of `tenants-auth-invite` — builds on `current_tenant_id()`, the RLS pattern, the migration pipeline, and the test harness established here.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `tenants` table exists with the columns needed to identify an escritório
- [ ] `users` table exists: `tenant_id` FK not null, `role` enum (`admin`/`advogado`/`secretario`)
- [ ] `current_tenant_id()` SECURITY DEFINER/STABLE function reads live from `public.users` by `auth.uid()` (ADR-0005) — no stale cached value
- [ ] RLS enabled + forced on `tenants` and `users`; policies scope by `tenant_id = current_tenant_id()`
- [ ] `drizzle-kit generate` produces migrations from `packages/db/schema.ts`; migrations apply via the Supabase CLI
- [ ] Integration harness runs migrations against a real disposable Postgres instance (no mocked query builder)
- [ ] Test: same-tenant read succeeds; cross-tenant read on `users` returns zero rows, as different simulated `auth.uid()` values
- [ ] Harness/pattern established here is documented well enough for tickets 02-04 (this spec) and the `tenants-auth-invite` tickets to reuse without re-deriving it
