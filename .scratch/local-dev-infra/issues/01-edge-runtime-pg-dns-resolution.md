# 01: Edge Functions can't reach local Postgres via `pg.Pool` (DNS resolution)

**Problem:** any Edge Function that opens a direct `pg.Pool` connection to `SUPABASE_DB_URL` (the CLI-generated local URL, hostname `supabase_db_<project>`) fails with `Error: getaddrinfo ENOTFOUND supabase_db_<project>` on every call, inside `supabase_edge_runtime_<project>`. Not specific to one function — reproduced identically on `tenants` (pre-existing, `done` since `tenants-auth-invite`) and on the new `daily-summary` (`supabase/functions/daily-summary/repository.ts`'s `resolveTenantIdForUser`/`fetchPendingDeadlines`). `deadlines-alerts` uses the same `pg.Pool` pattern and is presumed affected too, though not re-verified here.

**Status:** ready-for-agent

- [ ] Root-cause confirmed: user-worker process shares the *same* network namespace as the main `edge_runtime` process (`/proc/<pid>/ns/net` identical) — so it's not worker sandboxing/isolation.
- [ ] `getent hosts supabase_db_<project>` from inside the container resolves fine (glibc NSS via Docker's embedded DNS at `127.0.0.11`, per `/etc/resolv.conf`) — so it's not a missing DNS server or `/etc/hosts` entry.
- [ ] Reproduced on Supabase CLI `2.107.0` (edge-runtime `1.74.1`) AND after upgrading to `2.117.0` (edge-runtime `1.74.3`) — ruled out as an already-fixed upstream regression.
- [ ] No `deno` binary in the edge-runtime image to directly test `Deno.resolveDns` for a controlled repro of "Deno's own resolver vs. glibc's `getaddrinfo`".
- [ ] Leading hypothesis, unconfirmed: Deno's Node-compat `dns`/`net` layer (used by `pg` under the hood) uses its own Rust-side resolver instead of shelling out to glibc, and mis-parses or ignores Docker's auto-generated `/etc/resolv.conf` (has an unusual `options ndots:0` plus trailing comment lines) — a known category of Deno-in-Docker DNS bug.
- [ ] Doesn't block production: hosted Supabase has a different network topology (managed DNS/routing), so this is local-stack-only. Confirm this assumption once any function is actually deployed and hit for real (`deploy-pipeline`).
- [ ] Fix or documented workaround so the three `pg.Pool`-based functions (`tenants`, `deadlines-alerts`, `daily-summary`) can be verified end-to-end locally.

Environment where this was observed: WSL2 + Docker Desktop, two `supabase start` stacks present on the host (`legal_manager` + an unrelated `ebd-monorepo` project) — not known whether that's a contributing factor or incidental.

## Comments

**2026-09-23**: found while verifying `daily-summary` (this feature's own unit tests/typecheck/lint all pass; this bug only blocks the *local E2E* check against real Postgres, not the feature's correctness). Not reopening `tenants-auth-invite` since the bug predates and outlives this specific feature. Options considered and deferred: (a) point `SUPABASE_DB_URL` at the db container's raw IP as a one-off diagnostic (not a real fix, IP isn't stable across restarts), (b) restart Docker Desktop entirely (heavier, would also kill the unrelated `ebd-monorepo` stack). Neither attempted — user opted to accept current verification level (unit tests + typecheck/lint, matching the existing `tenants` function's own already-`done` verification bar) rather than chase this further right now.
