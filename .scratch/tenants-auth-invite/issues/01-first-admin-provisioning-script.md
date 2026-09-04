# 01: First-tenant/first-admin provisioning script

**What to build:** A standalone script (CLI, not a UI feature, not reachable from `apps/web`) that creates one `tenants` row and one `public.users` row with `role = 'admin'`, via the Auth Admin API — the same account-creation path invite will use later. This is the manual onboarding path PLANNING §8 already decided on, and it's also the repeatable seed both remaining tickets' integration tests need (no other way exists yet to get a real authenticated user into the system).

**Blocked by:** `postgres-schema-rls` ticket 01 (tenant/user foundation — needs `tenants`/`users` tables and `current_tenant_id()` to exist)

**Status:** ready-for-agent

- [ ] Script creates a `tenants` row and a `public.users` row (`role = 'admin'`) linked to a real Supabase Auth user via the Auth Admin API
- [ ] Script lives alongside `packages/db` tooling, not under `apps/web` — no path from the web app reaches it
- [ ] Running it against the local Supabase stack produces a real login-able admin account
- [ ] Documented usage (script args/invocation) so it doubles as manual-onboarding instructions and test-suite setup
