# packages/db

Physical Postgres schema (Drizzle `pg-core`) + RLS for the multi-tenant SaaS.
`src/schema.ts` is the single source of truth for table/column/enum/FK/check
shape — see `PLANNING.md` §4 and `docs/adr/000{1..5}-*.md` for the decisions
behind it. This doc is the reusable pattern/harness reference the
`postgres-schema-rls` spec's ticket 01 promises to tickets 02-04 and to
`tenants-auth-invite`.

## Migration pipeline

1. Add/change tables in `src/schema.ts`.
2. `pnpm --filter @legal-manager/db generate --name=<slug>` — diffs against
   the last snapshot in `supabase/migrations/meta/`, writes a new
   `<timestamp>_<slug>.sql` into `supabase/migrations/` (the `supabase`
   filename prefix in `drizzle.config.ts` matches what the Supabase CLI
   expects for ordering).
3. Anything **not expressible as a Drizzle table** — the `current_tenant_id()`
   function, `FORCE ROW LEVEL SECURITY`, `CREATE POLICY`, triggers, and the
   `GRANT`s every new tenant-scoped table needs (see below) — goes in a
   **hand-written custom migration** right after: `pnpm exec drizzle-kit
   generate --custom --name=<slug>-rls`, then fill in the empty `.sql` file.
   This keeps `schema.ts` an honest diff source (drizzle-kit can't diff SQL it
   didn't generate) while still shipping as an ordinary numbered migration.
4. Applied via the Supabase CLI (`supabase start` / `supabase migration up` /
   `supabase db reset`), same as any other Supabase project. Local dev ports
   are remapped in `supabase/config.toml` (55321-55329) to avoid clashing
   with another project's stack that may already be running on the default
   54321-54329 range on this machine — check `docker ps` before assuming the
   defaults are free.

## RLS pattern for a new tenant-scoped table

Every tenant-scoped table needs all four of these, split across the two
migration files described above:

- **`schema.ts`** (drizzle-kit-generated): `.enableRLS()` on the table, plus a
  `check()` for any invariant that's really "physical schema" (e.g. the
  `matters.status = 'rascunho' OR (...)` constraint, ADR-0004) — anything
  drizzle-kit can express, let it.
- **Custom migration**, `FORCE ROW LEVEL SECURITY`: `enableRLS()` only emits
  `ENABLE`, not `FORCE` — without forcing, the owning role (`postgres`, who
  runs migrations) would bypass RLS silently.
- **Custom migration**, `CREATE POLICY ... USING (tenant_id =
  public.current_tenant_id())`: reuse `current_tenant_id()` (defined once, in
  ticket 01's migration) — never invent a second tenant-resolution mechanism
  (ADR-0005).
- **Custom migration**, `GRANT <ops> ON TABLE ... TO authenticated`: new
  tables created by `postgres` are **not** auto-exposed to the Data API roles
  (see the `auto_expose_new_tables` note in `supabase/config.toml`) — RLS
  policies only gate *which rows*, the table still needs a base grant to be
  queryable/writable at all. Grant exactly the operations that table's
  policies actually allow (e.g. `users` is SELECT-only in the MVP — no
  client-reachable insert/update/delete, `tenants-auth-invite` provisions it
  via a service-role Edge Function instead).
- If a column must never be client-writable once set (e.g. `retention_until`
  — an ordinary `UPDATE` policy scoped only by `tenant_id` would otherwise let
  a tenant member null/backdate it and defeat the retention-gated `DELETE`
  policy right next to it), grant table-level `UPDATE` only on the columns
  that *should* be editable (`GRANT UPDATE (col1, col2, ...) ON table TO
  authenticated`) instead of a blanket table-level `UPDATE`. A composite FK's
  target tables (e.g. `clients`/`matter_catalog_items` for `matters`) need
  their own `unique(id, tenant_id)` — see `matters`' FKs in `schema.ts` for
  the pattern, and don't fall back to a plain single-column
  `.references()` for a tenant-scoped FK, or a row can end up referencing
  another tenant's parent row.

## Integration test harness (`test/`)

Real, disposable Postgres per test run (never a mocked query builder) via
Testcontainers, using the same `supabase/postgres` image the local Supabase
CLI stack uses:

- `test/global-setup.ts` (vitest `globalSetup`, runs once): starts the
  container, replays every file in `supabase/migrations/*.sql` in order
  against it, writes the resulting connection string to
  `test/.container-state.json`, and stops the container after the whole
  suite finishes.
- `test/harness.ts`: `withTx(fn)` opens one transaction per test (always
  rolled back — no manual cleanup) and hands `fn` a `TestTx` with
  `.asUser(userId)` / `.asSuperuser()` to switch simulated identity mid-test.
- `test/fixtures.ts`: raw-SQL fixture helpers (`createTenant`, `createUser`)
  — inserting through the schema itself, since fixture data needs the same
  constraints/FKs real writes would hit.

**Gotcha, already spent time on this once**: this image's baked-in
`auth.uid()` reads the `request.jwt.claim.sub` GUC directly — it does *not*
fall back to parsing a `request.jwt.claims` JSON blob (that richer version is
what a live PostgREST/GoTrue-fronted project ends up with). `asUser()`
already sets the right GUC; if you're debugging `auth.uid()` returning null
from a raw psql session against a bare container, that's why.

**Gotcha #2, also already spent time on this**: a bare container from this
image auto-grants `anon`/`authenticated`/`service_role` every privilege on
every new table (`\dp` on a fresh table shows `authenticated=arwdDxtm/postgres`
already) — a real Supabase-CLI-managed project does *not* do this
(`auto_expose_new_tables`, see `supabase/config.toml`), because `supabase
start` locks it down as part of its own bootstrap, outside anything tracked
in `supabase/migrations/`. `global-setup.ts` replicates that lockdown
(`ALTER DEFAULT PRIVILEGES ... REVOKE ALL ...`) *before* replaying our
migrations. Without it, every `GRANT`/column-restricted `GRANT` in our RLS
migrations looks like a no-op against this harness specifically — the
column-level exclusion of `retention_until` from `clients`/`matters`'
`UPDATE` grant (see below) silently didn't apply until this was added.

**No GoTrue in this harness** — it's bare Postgres, so `auth.users` and
`auth.uid()` exist (baked into the image) but nothing runs signup/login/JWT
issuance. `tenants-auth-invite`'s testing decision calls for reusing this
harness for real login/invite flows; that will need extending this setup
(e.g. a GoTrue container alongside, or switching to the full local Supabase
CLI stack) rather than the bare-Postgres container as-is.

Run with `pnpm --filter @legal-manager/db test` (or `pnpm test` from inside
`packages/db`). Each run pays real container-boot + first-run-migration cost
(~90s) — the image bootstraps its own auth/extensions/roles migrations before
accepting connections, on top of ours.

## First-tenant/first-admin provisioning (`scripts/provision-first-admin.ts`)

There's no self-service signup (PLANNING §8) — the only way into a brand new
tenant is this script, run against a live Supabase project (local `supabase
start` stack or a real one). It creates one `tenants` row and one
`public.users` row (`role = 'admin'`) linked to a real Supabase Auth user,
via the Auth Admin API (`auth.admin.createUser`) — the same account-creation
path `tenants-auth-invite`'s invite Edge Function uses for every user after
the first. Deliberately not reachable from `apps/web`: it's ops/CLI tooling,
and it's also how the `tenants-auth-invite` integration suite seeds its
first authenticated user.

```
SUPABASE_URL=http://127.0.0.1:55321 \
SUPABASE_SERVICE_ROLE_KEY=<service_role key from `supabase status`> \
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres \
pnpm --filter @legal-manager/db provision-first-admin \
  --tenant "Escritório Exemplo" --email admin@example.com --password 'trocar123!'
```

`--password` is optional — omit it to have one generated and printed once.
Row inserts go over a direct Postgres connection (`SUPABASE_DB_URL`), not the
Data API: `service_role` has no table grant on `tenants`/`users` in this
schema (only `authenticated` gets `SELECT`, see the RLS pattern above), so a
`supabase-js` `.from(...)` call from a service-role client would fail — the
Admin API (a separate, grant-independent HTTP surface) is only used to create
the Auth account itself. If the row inserts fail after the Auth user was
created, the script deletes that Auth user rather than leaving an
Auth-account-without-a-tenant-row orphan.
