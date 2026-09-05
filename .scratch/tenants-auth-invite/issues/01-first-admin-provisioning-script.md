# 01: First-tenant/first-admin provisioning script

**What to build:** A standalone script (CLI, not a UI feature, not reachable from `apps/web`) that creates one `tenants` row and one `public.users` row with `role = 'admin'`, via the Auth Admin API — the same account-creation path invite will use later. This is the manual onboarding path PLANNING §8 already decided on, and it's also the repeatable seed both remaining tickets' integration tests need (no other way exists yet to get a real authenticated user into the system).

**Blocked by:** `postgres-schema-rls` ticket 01 (tenant/user foundation — needs `tenants`/`users` tables and `current_tenant_id()` to exist)

**Status:** done

- [x] Script creates a `tenants` row and a `public.users` row (`role = 'admin'`) linked to a real Supabase Auth user via the Auth Admin API
- [x] Script lives alongside `packages/db` tooling, not under `apps/web` — no path from the web app reaches it
- [x] Running it against the local Supabase stack produces a real login-able admin account
- [x] Documented usage (script args/invocation) so it doubles as manual-onboarding instructions and test-suite setup

## Comments

Implemented as `packages/db/scripts/provision-first-admin.ts` (run via `pnpm --filter @legal-manager/db provision-first-admin`). Row inserts go over a direct Postgres connection (`SUPABASE_DB_URL`), not the Data API: `service_role` has no table grant on `tenants`/`users` in this schema (verified against a live `supabase start` stack — only `authenticated` gets `SELECT`), so the Auth Admin API is used only for the Auth account itself. Verified end-to-end against a local `supabase start` stack: created a tenant + admin row, then logged the resulting account in via GoTrue's password grant. See `packages/db/README.md` for usage docs.
