begin;
select plan(12);

-- Two households, one user each (ids fixed so the JWT claims can reference them).
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@rls.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@rls.test');
insert into public.households (id, name) values
  ('aaaaaaaa-1111-0000-0000-000000000000', 'Casa A'),
  ('bbbbbbbb-1111-0000-0000-000000000000', 'Casa B');
insert into public.household_members (user_id, household_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000000'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-1111-0000-0000-000000000000');
insert into public.expenses (household_id, name, category, default_amount, start_month) values
  ('aaaaaaaa-1111-0000-0000-000000000000', 'Internet A', 'Moradia', 100, '2026-01-01'),
  ('bbbbbbbb-1111-0000-0000-000000000000', 'Internet B', 'Moradia', 200, '2026-01-01'),
  ('bbbbbbbb-1111-0000-0000-000000000000', 'Energia B', 'Moradia', 300, '2026-01-01');

select ok(
  (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'),
  'every public table has row level security enabled');

-- Act as user A.
set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}';

select is((select count(*) from public.expenses)::int, 1, 'A sees only the expenses of its household');
select is((select name from public.expenses), 'Internet A', 'the visible expense is A''s');
select is((select count(*) from public.households)::int, 1, 'A sees only its household');
select is((select count(*) from public.household_members)::int, 1, 'A sees only its membership');

select throws_ok(
  $$ insert into public.expenses (household_id, name, category, default_amount, start_month)
     values ('bbbbbbbb-1111-0000-0000-000000000000', 'Intrusa', 'Outras', 1, '2026-01-01') $$,
  '42501', null, 'A cannot insert into B''s household');

select lives_ok(
  $$ insert into public.expenses (household_id, name, category, default_amount, start_month)
     values ('aaaaaaaa-1111-0000-0000-000000000000', 'Nova A', 'Outras', 1, '2026-01-01') $$,
  'A can insert into its own household');

update public.expenses set default_amount = 0 where name = 'Internet B';
delete from public.expenses where name = 'Energia B';

select throws_ok(
  $$ insert into public.cards (household_id, name, bank, brand, last4, limit_amount, closing_day, due_day, color)
     values ('aaaaaaaa-1111-0000-0000-000000000000', 'X', 'Banco', 'Visa', '1234567890123456', 1000, 1, 10, '#000000') $$,
  null, null, 'a full card number cannot be stored in last4');

select throws_ok(
  $$ insert into public.cards (household_id, name, bank, brand, last4, limit_amount, closing_day, due_day, color)
     values ('aaaaaaaa-1111-0000-0000-000000000000', 'X', 'Banco', 'Visa', '12a4', 1000, 1, 10, '#000000') $$,
  '23514', null, 'last4 accepts only digits');

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('invoices', 'aaaaaaaa-1111-0000-0000-000000000000/x.pdf', auth.uid()) $$,
  'A can upload into its household folder of the invoices bucket');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner)
     values ('invoices', 'bbbbbbbb-1111-0000-0000-000000000000/x.pdf', auth.uid()) $$,
  '42501', null, 'A cannot upload into B''s folder of the invoices bucket');

-- Back to the superuser to check that A's update/delete on B's rows did nothing.
reset role;
select results_eq(
  $$ select name, default_amount from public.expenses
     where household_id = 'bbbbbbbb-1111-0000-0000-000000000000' order by name $$,
  $$ values ('Energia B'::text, 300::numeric(12,2)), ('Internet B', 200) $$,
  'A cannot update or delete B''s rows');

select * from finish();
rollback;
