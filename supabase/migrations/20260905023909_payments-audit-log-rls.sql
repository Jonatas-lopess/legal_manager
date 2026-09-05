alter table "public"."payments" force row level security;
alter table "public"."audit_log" force row level security;

-- payments: plain per-tenant CRUD. The PLANNING §8 role matrix (no
-- `secretario` access) is app-layer, enforced in payments.service.ts by
-- clients-catalog-matters-crud — out of scope here (postgres-schema-rls
-- only guarantees tenant isolation, not the full RBAC matrix).
create policy "payments_all_own_tenant" on "public"."payments"
  for all to authenticated
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

grant select, insert, update, delete on "public"."payments" to authenticated;

-- audit_log: read-only to clients, scoped to their own tenant. No
-- insert/update/delete policy or grant — the trigger below is the only
-- writer, running SECURITY DEFINER as the (BYPASSRLS) migration owner.
create policy "audit_log_select_own_tenant" on "public"."audit_log"
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

grant select on "public"."audit_log" to authenticated;

create or replace function public.audit_log_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (tenant_id, user_id, action, entity, entity_id)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    auth.uid(),
    lower(tg_op)::public.audit_action,
    tg_table_name,
    coalesce(new.id, old.id)
  );
  return coalesce(new, old);
end;
$$;

-- Insert/delete always logs. Update logs only when a column actually
-- changed — a no-op `UPDATE ... SET x = x` (a full-row ORM save, a bare
-- `touch`) would otherwise dilute the log with rows that recorded nothing.
create trigger "clients_audit_log_insert_delete"
  after insert or delete on "public"."clients"
  for each row execute function public.audit_log_row_change();
create trigger "clients_audit_log_update"
  after update on "public"."clients"
  for each row when (old is distinct from new)
  execute function public.audit_log_row_change();

create trigger "matters_audit_log_insert_delete"
  after insert or delete on "public"."matters"
  for each row execute function public.audit_log_row_change();
create trigger "matters_audit_log_update"
  after update on "public"."matters"
  for each row when (old is distinct from new)
  execute function public.audit_log_row_change();

create trigger "payments_audit_log_insert_delete"
  after insert or delete on "public"."payments"
  for each row execute function public.audit_log_row_change();
create trigger "payments_audit_log_update"
  after update on "public"."payments"
  for each row when (old is distinct from new)
  execute function public.audit_log_row_change();
