-- Bug: deleting a tenant fails with `audit_log_tenant_id_tenants_id_fk`
-- (and, once that's patched, `audit_log_user_id_users_id_fk`) whenever it
-- has audited children (clients/matters/payments, and their owning users).
--
-- Root cause: `audit_log.tenant_id`/`user_id` are ON DELETE SET NULL
-- specifically so the audit trail outlives a removed tenant/user (see
-- 04-payments-audit-log's migration comment) — but that action only
-- rewrites *existing* audit_log rows that already reference the deleted
-- row. It does nothing for *new* rows. Deleting a tenant cascades to its
-- clients/matters/payments (and to `users`, via `users.tenant_id`), and
-- each cascaded client/matter/payment delete fires `audit_log_row_change()`,
-- which inserts a fresh audit_log row referencing `old.tenant_id` and
-- `auth.uid()` — but by the time that AFTER trigger runs, the tenant row
-- (and possibly the acting user's row, if its own cascade ran first) is
-- already gone, so the FK check on that insert fails.
--
-- Fix: look up whether the tenant/user rows are still present before
-- writing them; if not (mid-deletion via the same cascade), record null
-- instead, matching the SET NULL behavior those columns already have for
-- pre-existing rows.
create or replace function public.audit_log_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid := coalesce(new.tenant_id, old.tenant_id);
  v_user_id uuid := auth.uid();
begin
  insert into public.audit_log (tenant_id, user_id, action, entity, entity_id)
  values (
    case
      when exists (select 1 from public.tenants where id = v_tenant_id) then v_tenant_id
      else null
    end,
    case
      when exists (select 1 from public.users where id = v_user_id) then v_user_id
      else null
    end,
    lower(tg_op)::public.audit_action,
    tg_table_name,
    coalesce(new.id, old.id)
  );
  return coalesce(new, old);
end;
$$;
