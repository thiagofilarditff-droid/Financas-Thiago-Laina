-- Editing a fixed expense's or an income's default keeps the months before the current one: months that had
-- no persisted row get one with the OLD values in the same transaction as the update.
begin;
select plan(20);

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000001', 'f@hist.test'),
  ('dddddddd-0000-0000-0000-000000000002', 'g@hist.test');
insert into public.households (id, name) values
  ('dddddddd-1111-0000-0000-000000000000', 'Casa F'),
  ('dddddddd-1111-0000-0000-000000000099', 'Casa G');
insert into public.household_members (user_id, household_id) values
  ('dddddddd-0000-0000-0000-000000000001', 'dddddddd-1111-0000-0000-000000000000'),
  ('dddddddd-0000-0000-0000-000000000002', 'dddddddd-1111-0000-0000-000000000099');
insert into public.expenses (id, household_id, name, category, default_amount, payroll_deducted, start_month, end_month, is_fixed) values
  ('dddddddd-5555-0000-0000-000000000001', 'dddddddd-1111-0000-0000-000000000000', 'Condomínio', 'Moradia', 100, false, '2026-01-01', null, true),
  ('dddddddd-5555-0000-0000-000000000002', 'dddddddd-1111-0000-0000-000000000000', 'PNR', 'Moradia', 200, true, '2026-01-01', '2026-06-01', true),
  ('dddddddd-5555-0000-0000-000000000003', 'dddddddd-1111-0000-0000-000000000000', 'Internet', 'Moradia', 80, false, '2026-01-01', null, true),
  ('dddddddd-5555-0000-0000-000000000004', 'dddddddd-1111-0000-0000-000000000000', 'Escola', 'Educação', 900, false, '2027-01-01', null, true),
  ('dddddddd-5555-0000-0000-000000000099', 'dddddddd-1111-0000-0000-000000000099', 'Outra', 'Outras', 10, false, '2026-01-01', null, true);
insert into public.expense_entries (household_id, expense_id, month, amount, paid) values
  ('dddddddd-1111-0000-0000-000000000000', 'dddddddd-5555-0000-0000-000000000001', '2026-03-01', 120, true);
insert into public.incomes (id, household_id, name, default_amount, start_month) values
  ('dddddddd-6666-0000-0000-000000000001', 'dddddddd-1111-0000-0000-000000000000', 'Defesa', 1400, '2026-01-01');
insert into public.income_overrides (household_id, income_id, month, amount) values
  ('dddddddd-1111-0000-0000-000000000000', 'dddddddd-6666-0000-0000-000000000001', '2026-05-01', 1500);

set local role authenticated;
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-000000000001", "role": "authenticated"}';

-- Cash expense: 100 → 150 in Nov/2026.
select public.update_expense('dddddddd-5555-0000-0000-000000000001',
  '{"name": "Condomínio SQS", "category": "Moradia", "default_amount": 150, "payroll_deducted": false, "is_fixed": true,
    "payment_method": "cash", "card_id": null, "start_month": "2026-01-01", "end_month": null, "due_day": 10,
    "person_id": null, "notes": null}', '2026-11-01');
select is((select default_amount from public.expenses where id = 'dddddddd-5555-0000-0000-000000000001'), 150.00, 'the new default is saved');
select is((select name from public.expenses where id = 'dddddddd-5555-0000-0000-000000000001'), 'Condomínio SQS', 'the other fields are saved');
select is((select count(*) from public.expense_entries where expense_id = 'dddddddd-5555-0000-0000-000000000001')::int, 10,
  'Jan–Out/2026 now have an entry');
select is((select amount from public.expense_entries where expense_id = 'dddddddd-5555-0000-0000-000000000001' and month = '2026-01-01'),
  100.00, 'a past month keeps the old default');
select is((select paid from public.expense_entries where expense_id = 'dddddddd-5555-0000-0000-000000000001' and month = '2026-01-01'),
  false, 'a cash past month stays unpaid');
select is((select amount from public.expense_entries where expense_id = 'dddddddd-5555-0000-0000-000000000001' and month = '2026-03-01'),
  120.00, 'an already persisted month is untouched');
select is((select paid from public.expense_entries where expense_id = 'dddddddd-5555-0000-0000-000000000001' and month = '2026-03-01'),
  true, 'an already persisted month keeps its paid flag');
select is((select count(*) from public.expense_entries where expense_id = 'dddddddd-5555-0000-0000-000000000001'
  and month >= '2026-11-01')::int, 0, 'the current and future months follow the new default');

-- Payroll expense ended in Jun/2026: 200 → 250.
select public.update_expense('dddddddd-5555-0000-0000-000000000002',
  '{"name": "PNR", "category": "Moradia", "default_amount": 250, "payroll_deducted": true, "is_fixed": true,
    "payment_method": "cash", "card_id": null, "start_month": "2026-01-01", "end_month": "2026-06-01"}', '2026-11-01');
select is((select count(*) from public.expense_entries where expense_id = 'dddddddd-5555-0000-0000-000000000002')::int, 6,
  'only months up to the end month get an entry');
select ok((select bool_and(paid and amount = 200) from public.expense_entries where expense_id = 'dddddddd-5555-0000-0000-000000000002'),
  'payroll months are saved as paid with the old amount');

-- Saving without changing the amount or "em folha" (e.g. a rename) creates no entry.
select public.update_expense('dddddddd-5555-0000-0000-000000000003',
  '{"name": "Internet", "default_amount": 80, "payroll_deducted": false}', '2026-11-01');
select is((select count(*) from public.expense_entries where expense_id = 'dddddddd-5555-0000-0000-000000000003')::int, 0,
  'no entry is created when neither the amount nor "em folha" changes');
select public.update_expense('dddddddd-5555-0000-0000-000000000003', '{"name": "Internet claro"}', '2026-11-01');
select is((select name from public.expenses where id = 'dddddddd-5555-0000-0000-000000000003'), 'Internet claro',
  'a partial row keeps the fields it leaves out');
select is((select default_amount from public.expenses where id = 'dddddddd-5555-0000-0000-000000000003'), 80.00,
  'a partial row keeps the amount');

select public.update_expense('dddddddd-5555-0000-0000-000000000004', '{"default_amount": 950}', '2026-11-01');
select is((select count(*) from public.expense_entries where expense_id = 'dddddddd-5555-0000-0000-000000000004')::int, 0,
  'an expense starting in the future gets no entry');

select throws_ok($$select public.update_expense('dddddddd-5555-0000-0000-000000000099', '{"default_amount": 1}', '2026-11-01')$$,
  'P0001', null, 'an expense of another household cannot be updated');

-- Income: 1.400 → 1.600 in Nov/2026.
select public.update_income('dddddddd-6666-0000-0000-000000000001',
  '{"name": "Defesa", "gross": 2200, "discount": 600, "discount_label": "Desconto", "default_amount": 1600,
    "person_id": null, "start_month": "2026-01-01", "end_month": null}', '2026-11-01');
select is((select default_amount from public.incomes where id = 'dddddddd-6666-0000-0000-000000000001'), 1600.00, 'the new income default is saved');
select is((select count(*) from public.income_overrides where income_id = 'dddddddd-6666-0000-0000-000000000001')::int, 10,
  'Jan–Out/2026 now have an amount');
select is((select amount from public.income_overrides where income_id = 'dddddddd-6666-0000-0000-000000000001' and month = '2026-01-01'),
  1400.00, 'a past month keeps the old income');
select is((select amount from public.income_overrides where income_id = 'dddddddd-6666-0000-0000-000000000001' and month = '2026-05-01'),
  1500.00, 'an adjusted month is untouched');

select throws_ok($$select public.update_income('00000000-0000-0000-0000-000000000000', '{"default_amount": 1}', '2026-11-01')$$,
  'P0001', null, 'an unknown income is reported');

select * from finish();
rollback;
