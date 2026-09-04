# 04: Civil holiday sync Edge Function

**What to build:** `supabase/functions/deadlines-holiday-sync/` (Deno Edge Function, `index.ts`/`service.ts`/`repository.ts` split per PLANNING §6), triggered monthly by `pg_cron`+`pg_net`. Calls FeriadosAPI (Professional plan, per PLANNING §8) for national + all 27 UFs and upserts into `civil_holidays` on `(date, uf)`. Runs independently of the deadlines module/engine — only needs the `civil_holidays` table to exist.

**Blocked by:** 01 (`civil_holidays` table)

**Status:** ready-for-agent

- [ ] Edge Function calls FeriadosAPI for national + all 27 UFs and upserts rows into `civil_holidays`
- [ ] Upsert is idempotent: rerunning the sync produces no duplicate rows
- [ ] A simulated FeriadosAPI failure leaves existing `civil_holidays` rows untouched (no wipe)
- [ ] `pg_cron`+`pg_net` schedule invokes the function monthly
- [ ] Test: idempotent rerun (mocked FeriadosAPI response) produces no duplicates
- [ ] Test: simulated API failure leaves prior rows intact
