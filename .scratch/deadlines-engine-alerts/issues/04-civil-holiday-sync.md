# 04: Civil holiday sync Edge Function

**What to build:** `supabase/functions/deadlines-holiday-sync/` (Deno Edge Function, `index.ts`/`service.ts`/`repository.ts` split per PLANNING §6), triggered monthly by `pg_cron`+`pg_net`. Calls FeriadosAPI (Professional plan, per PLANNING §8) for national + all 27 UFs and upserts into `civil_holidays` on `(date, uf)`. Runs independently of the deadlines module/engine — only needs the `civil_holidays` table to exist.

**Blocked by:** 01 (`civil_holidays` table)

**Status:** done

- [x] Edge Function calls FeriadosAPI for national + all 27 UFs and upserts rows into `civil_holidays`
- [x] Upsert is idempotent: rerunning the sync produces no duplicate rows
- [x] A simulated FeriadosAPI failure leaves existing `civil_holidays` rows untouched (no wipe)
- [x] `pg_cron`+`pg_net` schedule invokes the function monthly
- [x] Test: idempotent rerun (mocked FeriadosAPI response) produces no duplicates
- [x] Test: simulated API failure leaves prior rows intact

## Comments

Implemented: `supabase/functions/deadlines-holiday-sync/` (`index.ts`/`service.ts`/`repository.ts` + tests), migration `20260909161223_deadlines-holiday-sync-cron.sql` (enables `pg_cron`/`pg_net`, Vault-secret-referenced monthly schedule), `supabase/config.toml` functions block (required for local routing, verified empirically). 3/3 tests, `tsc` clean, full pipeline smoke-tested end-to-end against the live local stack (cron → `net.http_post` → Kong → function → real FeriadosAPI network call).

Switched from a `supabase-js` service-role/PostgREST client to a direct `pg.Pool` connection for the upsert — `service_role` has no explicit table grant on `civil_holidays` on this project (`auto_expose_new_tables` off), same reasoning as `tenants/repository.ts`'s existing direct-Postgres precedent.

**Needs real-world verification before production**: FeriadosAPI's actual response wire format (no API key available to this agent — built from public docs + a live 401 smoke test confirming the base URL/paths, not the success shape) — isolated to `fetchHolidaysFromFeriadosApi`/`parseFeriadosApiResponse` in `repository.ts`.

**Unrelated pre-existing bug found, NOT fixed here (out of ticket scope)**: `tenants` Edge Function fails to boot under Deno — `packages/schema/src/index.ts` imports `cpf-cnpj-validator` as a bare specifier not in any import map. Affects any Edge Function importing `@legal-manager/schema`, including this feature's own ticket 05. Being fixed directly as a small infra follow-up alongside ticket 03's kickoff.
