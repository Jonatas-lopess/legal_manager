Status: done

# Multi-tenant auth + org/user-invite scaffolding (PLANNING §7 step 3)

## Problem Statement

Nothing in the app can be gated by tenant or role yet: there's no login, no session, and no way for an escritório (tenant) to get more than the one admin who was manually provisioned onto the platform (PLANNING §8: no self-service signup in the MVP). Every later module — clients, matters, deadlines, payments — needs an authenticated session with a known `tenant_id` and `role` before its RLS policies (ADR-0005) or its own permission checks mean anything. And user provisioning itself is a security-sensitive gap: creating a Supabase Auth account requires the service-role secret, which must never reach the browser, so today there is literally no way for an `admin` to bring a second `advogado`/`secretario` into their tenant without direct database/dashboard access.

## Solution

Add email+password Supabase Auth login/logout/password-reset to the `tenants` bounded context (already scaffolded, empty, per PLANNING §6's rule that auth/tenant logic isn't spread across contexts), plus an admin-only invite flow that provisions a new tenant member. Because creating an Auth user is a secret-requiring operation, invite goes through a new `supabase/functions/tenants/` Edge Function — the same carve-out PLANNING §4 already uses for payment webhooks and deadline-alert email, extended here to a third case. The Edge Function verifies the caller is an authenticated `admin`, derives the target `tenant_id` from the caller's own session server-side (never from client input), then uses the Auth Admin API to invite the user and provisions their `public.users` row (`tenant_id`, `role`) in the same request. First-tenant/first-admin creation stays the manual, non-UI provisioning path PLANNING §8 already decided — this spec adds a small script for it, since the integration suite (and any human bootstrapping a real tenant) needs a repeatable way to do that step, but it is explicitly not a product feature.

## User Stories

1. As an existing user, I want to log in with email + password, so that I get an authenticated session scoped to my tenant.
2. As a logged-in user, I want to log out, so that my session ends and the app returns to the login screen.
3. As a user who forgot their password, I want to request a reset-password email and set a new password, so that I'm not locked out without admin intervention.
4. As any authenticated user, I want the app to know my `tenant_id` and `role` immediately after login, so that routing/UI can gate on it without an extra round-trip I have to trigger manually.
5. As an unauthenticated visitor, I want every module route other than login/reset-password to redirect me to login, so that no tenant data is reachable without a session.
6. As an `admin`, I want to invite a new user by email with a chosen `role` (`advogado`/`secretario`), so that I can grow my escritório's team without needing database access.
7. As an `admin`, I want the invited user provisioned into *my* tenant specifically, with no way for the request to name a different tenant, so that inviting can't be abused to plant a user in another escritório.
8. As an `advogado` or `secretario`, I want an attempt to invite a user rejected, so that only `admin`s can grow the tenant's membership (PLANNING §8 role matrix).
9. As an invited user, I want to receive an email with a link that lets me set my own password and land in a working, already-tenant-scoped session, so that I never need an admin to hand me a temporary password out of band.
10. As an `admin`, I want to see the list of members already in my tenant with their role, so that I know who has access before inviting more people.
11. As a developer, I want `current_tenant_id()` (ADR-0005) reused as the single source of tenant resolution for every policy this spec adds, so that tenant-scoping logic doesn't fork into a second mechanism.
12. As a developer, I want the `users` table to have no client-reachable INSERT/UPDATE/DELETE RLS policy in the MVP, so that the Edge Function's service-role provisioning is the only way a `users` row is created or changed, with no accidental client-side path around it.
13. As a compliance-conscious admin, I want an intra-tenant roster (story 10) that already respects ADR-0001 (no isolation between two `advogado`s in the same tenant), so that any tenant member can see the tenant's own member list, but never another tenant's.
14. As a developer, I want a documented, scriptable way to provision the first tenant + first `admin` outside the app UI, so that manual onboarding (PLANNING §8) and the integration test suite both have a real, repeatable entry point instead of hand-editing the database.
15. As a developer, I want the invite Edge Function to reject a caller whose JWT is missing, expired, or not an `admin`, so that the one endpoint holding the service-role secret can't be used to escalate privilege.

## Implementation Decisions

- **Modules touched**: `apps/web/src/modules/tenants/*` (`tenants.controller.ts`, `tenants.service.ts`, `tenants.repository.ts`, `tenants.schema.ts`, `components/` for `LoginForm`, `ResetPasswordForm`, `InviteUserDialog`, `MembersTable`) and a new `supabase/functions/tenants/` Edge Function (`index.ts`, `service.ts`, `repository.ts`, same controller/service/repository slice convention as the web modules per PLANNING §6). `packages/schema` gains the Zod input shapes (`LoginInput`, `InviteUserInput`) reused by both sides.
- **Auth method**: Supabase Auth email + password (confirmed this session — MVP targets web/SPA per PLANNING §4, not desktop, so passwordless-only wasn't required). `resetPasswordForEmail` covers forgot-password; no magic-link login path in the MVP.
- **Session/role lookup**: `tenants.service.ts` exposes a `getCurrentUser()` that reads the caller's own `public.users` row (`tenant_id`, `role`) by `auth.uid()` right after Supabase Auth reports a session — reuses `current_tenant_id()` (ADR-0005) as the only tenant-resolution mechanism, no parallel lookup added.
- **Route guard**: a single guard reads `getCurrentUser()` and redirects to `/login` when there's no session; module routes (`clients`, `matters`, `deadlines`, `payments`, `catalog`, `audit`) mount behind it. Per-role UI/CRUD restriction beyond "authenticated or not" is each module's own concern (Out of Scope here) — this spec only guarantees a `tenant_id`/`role` is known and enforces the invite endpoint's own `admin`-only check.
- **Invite flow (Edge Function, `supabase/functions/tenants/`)**: verifies the incoming JWT server-side, looks up the caller's `tenant_id`/`role` via the same DB lookup RLS uses, rejects if not `admin`. On success, calls the Auth Admin API to invite the user by email (sends Supabase's built-in invite email, captured by the local stack's Inbucket/Mailpit for tests), then inserts the `public.users` row (`tenant_id` = caller's own, `role` = requested) linked to the new Auth user's id, all within the one request — a user is never left "Auth-account-exists-but-no-tenant-row" or vice versa. `tenant_id` is always server-derived from the caller's session, never accepted as a client-supplied field, satisfying story 7.
- **`users` RLS (extends the schema from `postgres-schema-rls`)**: add a `SELECT` policy — `tenant_id = current_tenant_id()` — so any tenant member can list their own tenant's roster (ADR-0001-consistent). Deliberately add **no** client-reachable `INSERT`/`UPDATE`/`DELETE` policy: the Edge Function's service-role key bypasses RLS entirely, so there is no authenticated-client path that can create or mutate a `users` row in the MVP.
- **First-tenant/first-admin provisioning**: a standalone script (not a UI feature) that creates a `tenants` row and one `public.users` row with `role = 'admin'`, via the same Auth Admin API path as invite. Used for manual onboarding (PLANNING §8) and as test-suite setup. Lives alongside `packages/db` tooling — exact location/CLI shape is the implementer's choice, but it must not be reachable from `apps/web`.
- **Member roster read model**: `MembersTable` reads `public.users` (`id`, `role`, and whatever display name/email column the schema exposes) for the caller's tenant only — no pending-vs-accepted distinction in the MVP (see Out of Scope).
- No CRUD permission enforcement for `clients`/`matters`/`deadlines`/`payments` is added here — this spec only makes `tenant_id`/`role` reliably available; each of those modules enforces its own rules against the role matrix in PLANNING §8 in its own spec.

## Testing Decisions

- Same seam as `postgres-schema-rls`: `tenants.service.ts` (and the Edge Function's `service.ts`) are the units under test, exercised against a real local Supabase stack (Postgres + GoTrue + the local Edge Function runtime), not a mocked `supabase-js` client — an auth/invite flow is exactly the kind of security-sensitive logic a mock would give false confidence about.
- Use the local stack's captured-email testing (Inbucket/Mailpit) to assert an invite/reset email was actually sent to the right address, not just that the API call returned success.
- Coverage: login success/failure (wrong password), logout clears session, reset-password round trip, `admin` invite success (Auth user + `public.users` row both created, correct `tenant_id`/`role`), non-`admin` invite attempt rejected (403-equivalent, no rows created), invite Edge Function called with a missing/expired JWT rejected, roster `SELECT` returns only the caller's own tenant's members even when a second tenant's rows exist in the same test database (mirrors the cross-tenant case pattern from `postgres-schema-rls`).
- Prior art: `postgres-schema-rls`'s integration harness (disposable/local Supabase, asserting on real Postgres+Auth behavior under different simulated users) is the direct precedent — reuse its harness setup rather than inventing a second one.

## Out of Scope

- Self-service signup — still explicitly rejected per PLANNING §8; the only ways into a tenant are manual first-admin provisioning and admin-issued invites.
- Changing an existing member's role, deactivating/removing a member, resending or cancelling a pending invite, and surfacing pending-vs-accepted status in the roster — all deferred; MVP roster is invite-and-list only.
- Per-module CRUD permission enforcement against the PLANNING §8 role matrix (`advogado` vs `secretario` on `payments`, etc.) — each module's own spec.
- The full custom-roles-per-tenant extension point (PLANNING §5/§8, still an open decision).
- Any UI for the first-tenant/first-admin provisioning script — CLI/ops tooling only.
- Anything in `supabase/functions/` beyond the `tenants` invite endpoint (payment webhook, deadline-alert email remain their own future specs).

## Further Notes

- Depends on `postgres-schema-rls` (`.scratch/postgres-schema-rls/`, status `ready-for-agent`) being implemented first — this spec adds one new RLS policy to `users` and otherwise assumes that schema exists exactly as specced there.
- Confirmed this session: MVP is web/SPA only (PLANNING §4), which settled the email+password vs. magic-link choice — desktop is explicitly deferred (PLANNING §5), so passwordless-only wasn't a fit.
- This is the second spec (after `postgres-schema-rls`) to give `supabase/functions/` real content — the `.gitkeep` there gets replaced by the `tenants/` function directory.
