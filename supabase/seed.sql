-- Local dev/test seed only (supabase/config.toml db.seed). Runs after
-- migrations on every `supabase db reset` / `supabase start` (fresh volume).
-- Creates a single admin account so the app is usable right after init —
-- see .env's admin@teste.local note.

do $$
declare
  v_tenant_id uuid;
  v_user_id uuid := gen_random_uuid();
begin
  insert into public.tenants (name) values ('Escritório Teste')
  returning id into v_tenant_id;

  -- GoTrue's Go structs scan every *_token column as a non-nullable string —
  -- a NULL there 500s the password grant ("converting NULL to string is
  -- unsupported"), so every token column needs an explicit '' default.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    'admin@teste.local', crypt('Senha-teste123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{}',
    now(), now(),
    '', '', '', '', '', ''
  );

  insert into auth.identities (
    provider_id, user_id, identity_data, provider, created_at, updated_at
  ) values (
    v_user_id::text, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', 'admin@teste.local', 'email_verified', true, 'phone_verified', false),
    'email', now(), now()
  );

  insert into public.users (id, tenant_id, role, name, email)
  values (v_user_id, v_tenant_id, 'admin', 'Admin Teste', 'admin@teste.local');
end $$;
