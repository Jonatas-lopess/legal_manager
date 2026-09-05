-- Ties `public.users.id` to the Supabase-managed (GoTrue) `auth.users.id` —
-- never expressed in packages/db/src/schema.ts, since drizzle-kit must never
-- try to create/alter a table it doesn't own.
alter table "public"."users"
  add constraint "users_id_auth_users_id_fk"
  foreign key ("id") references "auth"."users"("id") on delete cascade;

-- Resolves the acting tenant by looking up auth.uid() in public.users
-- (ADR-0005). security definer + a locked-down search_path so it runs with
-- the definer's (postgres, bypasses RLS) privileges regardless of the
-- caller's role, and can't be tricked by a caller-controlled search_path.
create or replace function public.current_tenant_id()
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select tenant_id from public.users where id = auth.uid()
$$;

-- RLS is enabled (packages/db/src/schema.ts, via .enableRLS()) but not yet
-- forced — force it so even the table owner is subject to policies.
alter table "public"."tenants" force row level security;
alter table "public"."users" force row level security;

-- A tenant only sees its own row (its primary key doubles as the tenant_id
-- every other table's policy compares against).
create policy "tenants_select_own" on "public"."tenants"
  for select
  to authenticated
  using (id = public.current_tenant_id());

-- Any tenant member sees every user row in their own tenant (ADR-0001: no
-- isolation between users within the same tenant). No insert/update/delete
-- policy: provisioning is a service-role-only path (tenants-auth-invite).
create policy "users_select_own_tenant" on "public"."users"
  for select
  to authenticated
  using (tenant_id = public.current_tenant_id());

-- New tables created by `postgres` are no longer auto-exposed to the Data
-- API roles (see supabase/config.toml `auto_expose_new_tables` note) —
-- explicit grants are required. RLS policies above still gate which rows;
-- these grants only gate the operation itself.
grant select on "public"."tenants" to authenticated;
grant select on "public"."users" to authenticated;
