# 02: Login/logout/reset-password + session role resolution + route guard

**What to build:** Email+password auth end to end in the `tenants` bounded context: `LoginForm`, `ResetPasswordForm`, and `tenants.service.ts`'s `getCurrentUser()` — which reads the caller's own `public.users` row (`tenant_id`, `role`) by `auth.uid()` right after Supabase Auth reports a session, reusing `current_tenant_id()` (ADR-0005) as the only tenant-resolution mechanism. A single route guard calls `getCurrentUser()` and redirects unauthenticated visitors to `/login`; module routes (`clients`, `matters`, `deadlines`, `payments`, `catalog`, `audit`) mount behind it.

**Blocked by:** 01 (first-admin provisioning script — tests need a real seeded user to log in as)

**Status:** ready-for-agent

- [ ] `LoginForm`: email+password login against Supabase Auth, wrong-password path fails cleanly
- [ ] Logout clears the session
- [ ] `ResetPasswordForm` + `resetPasswordForEmail` round trip works against the local stack (Inbucket/Mailpit captures the email)
- [ ] `getCurrentUser()` returns `tenant_id`/`role` immediately after login, sourced via `current_tenant_id()`/`auth.uid()` lookup — no parallel tenant-resolution path
- [ ] Route guard redirects unauthenticated visitors to `/login` for every module route; login/reset-password stay reachable without a session
- [ ] Test: login success, login failure (wrong password), logout, reset-password round trip, route guard redirect — all against a real local Supabase stack, not a mocked client
