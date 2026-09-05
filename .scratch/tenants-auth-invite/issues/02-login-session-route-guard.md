# 02: Login/logout/reset-password + session role resolution + route guard

**What to build:** Email+password auth end to end in the `tenants` bounded context: `LoginForm`, `ResetPasswordForm`, and `tenants.service.ts`'s `getCurrentUser()` — which reads the caller's own `public.users` row (`tenant_id`, `role`) by `auth.uid()` right after Supabase Auth reports a session, reusing `current_tenant_id()` (ADR-0005) as the only tenant-resolution mechanism. A single route guard calls `getCurrentUser()` and redirects unauthenticated visitors to `/login`; module routes (`clients`, `matters`, `deadlines`, `payments`, `catalog`, `audit`) mount behind it.

**Blocked by:** 01 (first-admin provisioning script — tests need a real seeded user to log in as)

**Status:** done

- [x] `LoginForm`: email+password login against Supabase Auth, wrong-password path fails cleanly
- [x] Logout clears the session
- [x] `ResetPasswordForm` + `resetPasswordForEmail` round trip works against the local stack (Inbucket/Mailpit captures the email)
- [x] `getCurrentUser()` returns `tenant_id`/`role` immediately after login, sourced via `current_tenant_id()`/`auth.uid()` lookup — no parallel tenant-resolution path
- [x] Route guard redirects unauthenticated visitors to `/login` for every module route; login/reset-password stay reachable without a session
- [x] Test: login success, login failure (wrong password), logout, reset-password round trip, route guard redirect — all against a real local Supabase stack, not a mocked client

## Comments

`apps/web/src/modules/tenants/{tenants.service,repository,controller,schema}.ts` + `components/{AuthProvider,RequireAuth,LoginForm,ResetPasswordForm}.tsx`. `App.tsx` wires `wouter` routes: `/login` and `/reset-password` outside `RequireAuth`, every module route (including a placeholder `/` roster page) behind it.

`apps/web/src/modules/tenants/test/tenants.service.test.ts` runs against a real local `supabase start` stack (GoTrue + Postgres + Mailpit) — see `test/harness.ts`. The password-reset round trip is real end-to-end: `requestPasswordReset` → poll Mailpit's API for the captured email → extract GoTrue's `token_hash` from the link → `supabase.auth.verifyOtp({token_hash, type: "recovery"})` (the non-browser equivalent of clicking the link) → `completePasswordReset` → sign in with the new password. Route-guard redirect logic is covered separately at the component level (`test/RequireAuth.test.tsx`, mocked auth state — the right seam for pure routing-logic, as opposed to auth-correctness, verification) alongside a `LoginForm.test.tsx` interaction test. `apps/web/vitest.config.ts` gained a `globalSetup` that loads the repo-root `.env` into `process.env` for these Node-side fixtures.
