# 01: Edge Functions can't reach local Postgres via `pg.Pool` (DNS resolution)

**Problem:** any Edge Function that opens a direct `pg.Pool` connection to `SUPABASE_DB_URL` (the CLI-generated local URL, hostname `supabase_db_<project>`) fails with `Error: getaddrinfo ENOTFOUND supabase_db_<project>` on every call, inside `supabase_edge_runtime_<project>`. Not specific to one function — reproduced identically on `tenants` (pre-existing, `done` since `tenants-auth-invite`) and on the new `daily-summary` (`supabase/functions/daily-summary/repository.ts`'s `resolveTenantIdForUser`/`fetchPendingDeadlines`). `deadlines-alerts` uses the same `pg.Pool` pattern and is presumed affected too, though not re-verified here.

**Status:** done

- [x] Root cause confirmed (2026-10-02): Deno's own Rust DNS resolver (hickory, used by `node:dns` `lookup` and `Deno.resolveDns`) rejects the underscores in `supabase_db_<project>` — `Deno.resolveDns` surfaces it verbatim: `proto error: Label contains invalid characters`. glibc's `getent` accepts the name, which is why it looked like a Docker DNS problem.
- [x] Ruled out: network namespace/worker sandboxing, missing DNS server, CLI/edge-runtime version (same on `2.107.0` and `2.117.0`), musl (binary is glibc-linked), `resolv.conf` quirks, the second `ebd-monorepo` stack.
- [x] Probe against the live stack: `dns.lookup`/`Deno.resolveDns`/`net.connect` all fail for `supabase_db_legal_manager`, all succeed for the underscore-free network aliases `db` and `db.supabase.internal` (`172.20.0.2`, `connect: OK`).
- [x] Fix: `supabase/functions/_shared/db-url.ts` `resolveDbUrl()` swaps a `supabase_db_*` host for the `db` alias; any other host is returned untouched, so hosted Supabase is unaffected. Wired into `tenants`, `daily-summary`, `deadlines-alerts`, `deadlines-holiday-sync` (`index.ts`). Unit-tested in `daily-summary/test/db-url.test.ts`.
- [x] Verified end-to-end on the local stack: `tenants` invite → 201 + member removal → 200 (real `pg` writes/reads); `daily-summary` now passes the DB steps (stops at Groq, no key locally); `deadlines-alerts`/`deadlines-holiday-sync` now start but were not run to completion (`deadlines-alerts` needs `RESEND_API_KEY`).
- [ ] Still unconfirmed: that hosted Supabase never hits this (hostname has no underscore, so it shouldn't) — confirm on the first real deploy (`deploy-pipeline`).

## Comments

**2026-09-23**: found while verifying `daily-summary` (this feature's own unit tests/typecheck/lint all pass; this bug only blocks the *local E2E* check against real Postgres, not the feature's correctness). Not reopening `tenants-auth-invite` since the bug predates and outlives this specific feature. Options considered and deferred: (a) point `SUPABASE_DB_URL` at the db container's raw IP as a one-off diagnostic (not a real fix, IP isn't stable across restarts), (b) restart Docker Desktop entirely (heavier, would also kill the unrelated `ebd-monorepo` stack). Neither attempted — user opted to accept current verification level.

**2026-10-02**: fixed. The first hypothesis above (Deno ignoring Docker's `resolv.conf`) was wrong; the real cause was the underscores. Gotcha for future probing: `supabase start` serves functions from a cached worker — after editing a function, `docker restart supabase_edge_runtime_<project>` (a new function also needs a `[functions.<slug>]` block in `config.toml` + a stack restart). Also, `supabase start` in this environment failed with `storage`/`studio` unhealthy; `supabase start -x storage-api,imgproxy,studio` brings up everything the functions need.
