-- deadlines-engine-alerts/05: daily pg_cron+pg_net schedule that invokes the
-- deadlines-alerts Edge Function. Hand-written (not drizzle-kit-generated),
-- mirrors 20260909161223_deadlines-holiday-sync-cron.sql's exact
-- Vault-secret-reference pattern almost verbatim — only the job name,
-- schedule, and secret names differ (daily, not monthly; `deadlines-alerts`,
-- not `deadlines-holiday-sync`) — see that migration's much longer comment
-- block for the full reasoning (pg_cron/pg_net extension placement, why
-- Vault rather than hardcoding the URL/key, why `api.supabase.internal`
-- rather than the host-mapped port, and the "NEEDS VERIFICATION" caveat on
-- this whole pattern never having been exercised end-to-end against a real
-- deployed project). Not repeated at length here to avoid drift between two
-- copies of the same explanation — this file only notes what's different.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- One-time setup per environment (not part of this migration — real secret
-- values can't be committed): run once against that environment's own
-- database, using the `service_role key` printed by `supabase status`:
--
--   select vault.create_secret(
--     'http://api.supabase.internal:8000/functions/v1/deadlines-alerts',
--     'deadlines_alerts_url'
--   );
--   select vault.create_secret(
--     '<service_role key from `supabase status`>',
--     'deadlines_alerts_service_role_key'
--   );
--
-- Until these two secrets exist for a given environment, the job's
-- `select ... limit 1` subqueries return NULL and `net.http_post` fails
-- safely (a null URL/auth header, not a leaked or wrong one) — same
-- intentional no-op-until-configured behavior as the holiday-sync schedule.
select cron.schedule(
  'deadlines-alerts',
  -- Daily: 06:00 (spec's Implementation Decisions: "triggered daily by
  -- pg_cron+pg_net"; 06:00 rather than holiday-sync's 03:00 so it runs
  -- comfortably after the holiday-sync's own monthly 03:00 slot on any day
  -- they'd coincide, and well before a typical Brazilian escritório's
  -- business day starts — story 24/25 want the warning to already be there
  -- "so I get an early warning while there's still time to act").
  '0 6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'deadlines_alerts_url' limit 1),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'deadlines_alerts_service_role_key' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
