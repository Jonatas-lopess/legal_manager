alter table "public"."deadlines" force row level security;
alter table "public"."deadline_tags" force row level security;

-- deadlines: no retention concept (that's clients/matters only) — plain
-- per-tenant CRUD, same shape as matter_catalog_items/tags.
create policy "deadlines_all_own_tenant" on "public"."deadlines"
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- deadline_tags: attach/detach only — mirrors matter_tags (per-command
-- policies, not `for all`, so update never ends up implicitly granted).
create policy "deadline_tags_select_own_tenant" on "public"."deadline_tags"
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "deadline_tags_insert_own_tenant" on "public"."deadline_tags"
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id());

create policy "deadline_tags_delete_own_tenant" on "public"."deadline_tags"
  for delete to authenticated
  using (tenant_id = public.current_tenant_id());

grant select, insert, update, delete on "public"."deadlines" to authenticated;
grant select, insert, delete on "public"."deadline_tags" to authenticated;
