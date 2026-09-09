alter table "public"."civil_holidays" force row level security;
alter table "public"."forensic_holidays" force row level security;
alter table "public"."notifications" force row level security;

-- civil_holidays/forensic_holidays: global reference data, readable by any
-- authenticated user regardless of tenant — no insert/update/delete policy
-- at all, since only the sync Edge Function's service-role key writes here
-- (bypasses RLS entirely, same lockdown pattern as `users`).
create policy "civil_holidays_select_all" on "public"."civil_holidays"
  for select to authenticated
  using (true);

create policy "forensic_holidays_select_all" on "public"."forensic_holidays"
  for select to authenticated
  using (true);

grant select on "public"."civil_holidays" to authenticated;
grant select on "public"."forensic_holidays" to authenticated;

-- notifications: stricter than every other tenant-scoped table so far —
-- isolates *within* the tenant too, by recipient, since a notification is
-- addressed to one specific user, not shared tenant-wide reading (unlike
-- ADR-0001's no-isolation-within-tenant default for matters/deadlines/etc).
create policy "notifications_select_own" on "public"."notifications"
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and recipient_user_id = auth.uid()
  );

create policy "notifications_update_own" on "public"."notifications"
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and recipient_user_id = auth.uid()
  )
  with check (
    tenant_id = public.current_tenant_id()
    and recipient_user_id = auth.uid()
  );

-- No insert policy/grant: only the alerts Edge Function's service-role key
-- creates rows (bypasses RLS), same lockdown pattern as `users`. The UPDATE
-- grant is column-restricted to read_at only — a client should be able to
-- mark their own notification read, never rewrite status/payload/sent_at/
-- category/etc (same pattern as retention_until on clients/matters).
grant select on "public"."notifications" to authenticated;
grant update (read_at) on "public"."notifications" to authenticated;
