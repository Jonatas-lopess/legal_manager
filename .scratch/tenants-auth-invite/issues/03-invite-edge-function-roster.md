# 03: Admin invite Edge Function + member roster

**What to build:** `supabase/functions/tenants/` Edge Function: verifies the caller's JWT server-side, rejects if missing/expired/not `admin`, derives the target `tenant_id` from the caller's own session (never client input), then in one request calls the Auth Admin API to invite the user by email and inserts their `public.users` row (`tenant_id`, requested `role`) — never leaving an Auth account without a tenant row or vice versa. Adds a `users` RLS `SELECT` policy (`tenant_id = current_tenant_id()`, ADR-0001-consistent) with deliberately no client-reachable INSERT/UPDATE/DELETE policy on `users` — the Edge Function's service-role key is the only path that creates/mutates a `users` row. `InviteUserDialog` and `MembersTable` (roster of the caller's tenant, no pending-vs-accepted distinction) round it out.

**Blocked by:** 01 (first-admin provisioning — need a seeded admin to invite from in tests), 02 (login/session — need a working way to obtain an authenticated caller JWT for the Edge Function)

**Status:** ready-for-agent

- [ ] Edge Function rejects a request with missing/expired JWT
- [ ] Edge Function rejects a non-`admin` caller (advogado/secretario), no rows created
- [ ] Edge Function success path: Auth user invited by email (captured by Inbucket/Mailpit in tests) AND `public.users` row created in the same request, `tenant_id` always the caller's own tenant regardless of any client-supplied value
- [ ] `users` gains a `SELECT` RLS policy scoped by `current_tenant_id()`; no INSERT/UPDATE/DELETE policy exists for authenticated clients
- [ ] `InviteUserDialog` lets an admin invite by email + role (`advogado`/`secretario`)
- [ ] `MembersTable` lists the caller's own tenant's members (id, role, display name/email) — never another tenant's, even when a second tenant's rows exist in the same test database
- [ ] Test: invite success, non-admin invite rejected, missing/expired-JWT invite rejected, roster cross-tenant isolation — all against the local Supabase stack
