begin;
select plan(5);

insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'a@sp.test');
insert into public.households (id, name) values ('aaaaaaaa-1111-0000-0000-000000000000', 'Casa A');
insert into public.household_members (user_id, household_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000000');
insert into public.people (id, household_id, name) values
  ('aaaaaaaa-2222-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000', 'Ana');

set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}';

select public.save_payslip('aaaaaaaa-1111-0000-0000-000000000000', 'aaaaaaaa-2222-0000-0000-000000000000', '2026-05-01',
  '[{"kind":"provento","label":"Soldo","amount":100.00,"sort_order":0}]');
select public.save_payslip('aaaaaaaa-1111-0000-0000-000000000000', 'aaaaaaaa-2222-0000-0000-000000000000', '2026-05-01',
  '[{"kind":"provento","label":"Soldo","amount":200.00,"sort_order":0},{"kind":"desconto","label":"IR","amount":10.00,"sort_order":1}]');

select is((select count(*) from public.payslips)::int, 1, 'same valid_from reuses the payslip');
select is((select count(*) from public.payslip_lines)::int, 2, 'second save replaced the lines');

select throws_ok($$select public.save_payslip('aaaaaaaa-1111-0000-0000-000000000000', 'aaaaaaaa-2222-0000-0000-000000000000', '2026-05-01',
  '[{"kind":"provento","label":"Novo","amount":1,"sort_order":0},{"kind":"invalido","label":"X","amount":1,"sort_order":1}]')$$,
  '23514', null, 'invalid line is rejected');
select is((select sum(amount) from public.payslip_lines where kind = 'provento'), 200.00, 'previous lines survive a failed save');
select throws_ok($$select public.save_payslip('aaaaaaaa-1111-0000-0000-000000000000', 'aaaaaaaa-2222-0000-0000-000000000000', '2026-06-01',
  '[{"kind":"invalido","label":"X","amount":1,"sort_order":0}]')$$,
  '23514', null, 'failed first save');

select * from finish();
rollback;
