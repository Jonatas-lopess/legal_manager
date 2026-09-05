alter table "public"."clients" force row level security;
alter table "public"."matter_catalog_items" force row level security;
alter table "public"."matter_tags" force row level security;
alter table "public"."matters" force row level security;
alter table "public"."tags" force row level security;

-- clients: retention (LGPD, §8) gates physical delete, not read/write.
create policy "clients_select_own_tenant" on "public"."clients"
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "clients_insert_own_tenant" on "public"."clients"
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy "clients_update_own_tenant" on "public"."clients"
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- A null retention_until means "not yet computed" — fail closed, same as a
-- future one, rather than treat "unset" as "unrestricted".
create policy "clients_delete_own_tenant_after_retention" on "public"."clients"
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and retention_until is not null
    and retention_until < now()
  );

-- matter_catalog_items: no retention concept, plain per-tenant CRUD.
create policy "matter_catalog_items_all_own_tenant" on "public"."matter_catalog_items"
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- matters: same retention gate as clients (ADR/§8 LGPD decision).
create policy "matters_select_own_tenant" on "public"."matters"
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "matters_insert_own_tenant" on "public"."matters"
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy "matters_update_own_tenant" on "public"."matters"
  for update to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

create policy "matters_delete_own_tenant_after_retention" on "public"."matters"
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and retention_until is not null
    and retention_until < now()
  );

-- tags: no retention concept, plain per-tenant CRUD.
create policy "tags_all_own_tenant" on "public"."tags"
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- matter_tags: attach/detach only — no update policy at all (a join row is
-- never meaningfully updated in place; splitting into per-command policies,
-- instead of one `for all`, is what actually keeps update off the table).
create policy "matter_tags_select_own_tenant" on "public"."matter_tags"
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "matter_tags_insert_own_tenant" on "public"."matter_tags"
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy "matter_tags_delete_own_tenant" on "public"."matter_tags"
  for delete to authenticated
  using (tenant_id = public.current_tenant_id());

-- New tables created by `postgres` are not auto-exposed to the Data API
-- roles (see supabase/config.toml `auto_expose_new_tables`) — grants gate
-- the operation itself, RLS policies above gate which rows.
grant select, insert, delete on "public"."clients" to authenticated;
grant select, insert, update, delete on "public"."matter_catalog_items" to authenticated;
grant select, insert, delete on "public"."matters" to authenticated;
grant select, insert, update, delete on "public"."tags" to authenticated;
grant select, insert, delete on "public"."matter_tags" to authenticated;

-- Column-level UPDATE grants deliberately exclude retention_until: without
-- this, clients_update_own_tenant/matters_update_own_tenant would let any
-- tenant member null out or backdate retention_until and immediately
-- physical-delete a row the retention-gated DELETE policy above was meant
-- to protect. id/tenant_id/created_at are excluded too (identity/audit
-- fields, never legitimately updated).
grant update (
  status, name, cpf, cnpj, rg, birth_date, phone, email, address,
  marital_status, profession, opposing_party, power_of_attorney,
  observations, deleted_at, updated_at
) on "public"."clients" to authenticated;

grant update (
  client_id, matter_catalog_item_id, status, uf, comarca, municipio,
  description, deleted_at, updated_at
) on "public"."matters" to authenticated;
