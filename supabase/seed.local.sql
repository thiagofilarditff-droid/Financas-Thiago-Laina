-- SOMENTE DESENVOLVIMENTO LOCAL (roda antes de seed.sql no `supabase db reset`).
-- Cria dois usuários de teste e aponta seed.sql para eles. Nunca execute em produção.
--   thiago@local.test / senha-local-123
--   laina@local.test  / senha-local-123
do $$
declare
  u record;
begin
  for u in select * from (values
    ('11111111-1111-4111-8111-111111111111'::uuid, 'thiago@local.test'),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'laina@local.test')
  ) as t(id, email) loop
    if not exists (select 1 from auth.users where email = u.email) then
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new
      ) values (
        '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
        extensions.crypt('senha-local-123', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
      );
      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), u.id, u.id::text, 'email',
        jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now());
    end if;
  end loop;
end $$;

select set_config('seed.thiago_email', 'thiago@local.test', false);
select set_config('seed.laina_email', 'laina@local.test', false);
