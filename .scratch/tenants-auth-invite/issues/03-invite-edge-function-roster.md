# 03: Admin invite Edge Function + member roster

**What to build:** `supabase/functions/tenants/` Edge Function: verifies the caller's JWT server-side, rejects if missing/expired/not `admin`, derives the target `tenant_id` from the caller's own session (never client input), then in one request calls the Auth Admin API to invite the user by email and inserts their `public.users` row (`tenant_id`, requested `role`) — never leaving an Auth account without a tenant row or vice versa. Adds a `users` RLS `SELECT` policy (`tenant_id = current_tenant_id()`, ADR-0001-consistent) with deliberately no client-reachable INSERT/UPDATE/DELETE policy on `users` — the Edge Function's service-role key is the only path that creates/mutates a `users` row. `InviteUserDialog` and `MembersTable` (roster of the caller's tenant, no pending-vs-accepted distinction) round it out.

**Blocked by:** 01 (first-admin provisioning — need a seeded admin to invite from in tests), 02 (login/session — need a working way to obtain an authenticated caller JWT for the Edge Function)

**Status:** done

- [x] Edge Function rejects a request with missing/expired JWT
- [x] Edge Function rejects a non-`admin` caller (advogado/secretario), no rows created
- [x] Edge Function success path: Auth user invited by email (captured by Inbucket/Mailpit in tests) AND `public.users` row created in the same request, `tenant_id` always the caller's own tenant regardless of any client-supplied value
- [x] `users` gains a `SELECT` RLS policy scoped by `current_tenant_id()`; no INSERT/UPDATE/DELETE policy exists for authenticated clients
- [x] `InviteUserDialog` lets an admin invite by email + role (`advogado`/`secretario`)
- [x] `MembersTable` lists the caller's own tenant's members (id, role, display name/email) — never another tenant's, even when a second tenant's rows exist in the same test database
- [x] Test: invite success, non-admin invite rejected, missing/expired-JWT invite rejected, roster cross-tenant isolation — all against the local Supabase stack

## Comments

The `users` SELECT RLS policy (`users_select_own_tenant`) already shipped in `postgres-schema-rls`'s migration — verified (via `psql \dp` against a live stack) that `service_role` has no table grant on `tenants`/`users` at all, so the Edge Function's row insert goes over a direct Postgres connection (`SUPABASE_DB_URL`), not `supabase-js` `.from(...)`; the Admin API is used only for `auth.admin.inviteUserByEmail`.

Implemented as `supabase/functions/tenants/{index.ts,service.ts,repository.ts}`, a new pnpm workspace package (`@legal-manager/edge-tenants`, added `supabase/functions/*` to `pnpm-workspace.yaml`) so `service.ts`/`repository.ts` — plain TS, no Deno globals — run unmodified under both Node/vitest (this package's own `node_modules`) and the Deno edge runtime (`supabase/functions/tenants/deno.json` maps `@legal-manager/schema`, `@supabase/supabase-js`, `pg`, `zod` for Deno; `index.ts` additionally uses `npm:` specifiers directly since it's Deno-only).

`test/service.test.ts` (5 tests) runs against a real local `supabase start` stack. Also smoke-tested the actual deployed HTTP path via `supabase functions serve` + `curl`: success (201, real invite email landed in Mailpit), missing JWT (401), invalid JWT (401) — all behaved as the unit tests predict.

`InviteUserDialog`/`MembersTable` in `apps/web/src/modules/tenants/components/`; roster cross-tenant isolation is covered at the service level in ticket 02's `tenants.service.test.ts` (the right seam — it's fundamentally an RLS/service correctness question).
