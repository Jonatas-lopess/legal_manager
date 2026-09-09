-- deadlines-engine-alerts/04: monthly pg_cron+pg_net schedule that invokes
-- the deadlines-holiday-sync Edge Function. Hand-written (not
-- drizzle-kit-generated) per packages/db/README.md's "anything not
-- expressible as a Drizzle table goes in a custom migration" rule — a cron
-- schedule has no `schema.ts` representation at all.

-- Neither extension appeared in any prior migration (checked
-- supabase/migrations/*.sql before adding this) — both need to live in the
-- `extensions` schema, already on every request's search_path
-- (supabase/config.toml's [api] extra_search_path = ["public", "extensions"]).
-- `pg_net` happens to already be installed on this project's local stack
-- (bundled/preloaded by the Supabase Postgres image), `pg_cron` isn't yet —
-- `if not exists` makes this migration a correct no-op either way, and safe
-- to replay on a fresh/deployed project where neither is installed.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- pg_cron jobs run as the `postgres` role inside the database (the role
-- that runs migrations), not as a Supabase Data API caller — nothing here
-- goes through PostgREST/RLS, so no GRANT/POLICY changes are needed for the
-- schedule itself. `net.http_post` is what actually reaches the Edge
-- Function, over plain HTTP(S) from inside Postgres.
--
-- The function URL and its auth header must NOT be hardcoded in this file:
-- it's checked into git and replayed identically in every environment
-- (local dev, CI, and eventually a real deployed project), but the actual
-- URL and the service-role key both differ per environment, and the key is
-- a secret that must never land in version control. Following Supabase's
-- own documented pg_cron+pg_net-calls-an-Edge-Function pattern, both are
-- read at schedule-run time from Supabase Vault (already installed on this
-- project — `select * from pg_extension where extname = 'supabase_vault'`)
-- via the `vault.decrypted_secrets` view, by name. Until an operator creates
-- these two secrets for a given environment, the job's `select ... limit 1`
-- subqueries return NULL and `net.http_post` fails safely (a null URL/auth
-- header, not a leaked or wrong one) — this schedule intentionally does
-- nothing useful until that one-time setup happens.
--
-- One-time setup per environment (not part of this migration — a real
-- secret value, so it can't be committed): run once against that
-- environment's own database, e.g. for THIS project's local `supabase
-- start` stack, from `psql "$SUPABASE_DB_URL"` or the Studio SQL editor,
-- using the `service_role key` printed by `supabase status`:
--
--   select vault.create_secret(
--     'http://api.supabase.internal:8000/functions/v1/deadlines-holiday-sync',
--     'deadlines_holiday_sync_url'
--   );
--   select vault.create_secret(
--     '<service_role key from `supabase status`>',
--     'deadlines_holiday_sync_service_role_key'
--   );
--
-- `api.supabase.internal` is the Supabase CLI's own stable Docker-network
-- alias for the local API gateway (kong) — confirmed reachable from the
-- `db` container (`docker inspect supabase_db_legal_manager` /
-- `supabase_kong_legal_manager` both show `supabase_network_legal_manager`
-- as a shared network, with kong aliased to both `kong` and
-- `api.supabase.internal`); the host-mapped `127.0.0.1:55321` from
-- `supabase status` is NOT reachable from inside the Postgres container
-- itself, since that port mapping only exists on the Docker host, not
-- inside the container network pg_cron/pg_net run in. A real deployed
-- project instead uses its own `https://<project-ref>.supabase.co/functions/
-- v1/deadlines-holiday-sync` URL and that project's own service-role key —
-- same two secret names, different values, set once via the Supabase
-- Dashboard/CLI for that project rather than this local recipe.
--
-- NEEDS VERIFICATION: this vault-secret-reference pattern for `url`/
-- `headers` is modeled on Supabase's published pg_cron+pg_net+Edge-Function
-- guide, not exercised end-to-end against a real deployed project as part
-- of this ticket (no such project/credentials available) — see this
-- ticket's final report.
select cron.schedule(
  'deadlines-holiday-sync',
  -- Monthly: 03:00 on the 1st of every month.
  '0 3 1 * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'deadlines_holiday_sync_url' limit 1),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'deadlines_holiday_sync_service_role_key' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
