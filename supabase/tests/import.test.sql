begin;
select plan(9);

insert into auth.users (id, email) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b@imp.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'c@imp.test');
insert into public.households (id, name) values
  ('bbbbbbbb-1111-0000-0000-000000000000', 'Casa B'),
  ('bbbbbbbb-1111-0000-0000-000000000099', 'Casa C');
insert into public.household_members (user_id, household_id) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000000'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-1111-0000-0000-000000000099');
insert into public.cards (id, household_id, name, closing_day, due_day) values
  ('bbbbbbbb-3333-0000-0000-000000000000', 'bbbbbbbb-1111-0000-0000-000000000000', 'Nubank', 3, 10),
  ('bbbbbbbb-3333-0000-0000-000000000099', 'bbbbbbbb-1111-0000-0000-000000000099', 'Outro', 3, 10);

set local role authenticated;
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000001", "role": "authenticated"}';

-- First import: a new installment purchase (create) and two plain items.
select public.save_imported_invoice(jsonb_build_object(
  'household_id', 'bbbbbbbb-1111-0000-0000-000000000000', 'card_id', 'bbbbbbbb-3333-0000-0000-000000000000',
  'due_month', '2026-12-01', 'due_date', '2026-12-10', 'total', 300.00, 'source', 'pdf', 'pdf_path', 'x/1.pdf',
  'items', jsonb_build_array(
    jsonb_build_object('date', '2026-11-02', 'description', 'Loja X 02/10', 'amount', 100.00, 'category', 'Outras',
      'installment_n', 2, 'installment_total', 10, 'expense_id', null,
      'plan', jsonb_build_object('create', jsonb_build_object('first_due_month', '2026-11-01'))),
    jsonb_build_object('date', '2026-11-03', 'description', 'Mercado', 'amount', 150.00, 'category', 'Alimentação',
      'installment_n', null, 'installment_total', null, 'expense_id', null, 'plan', null),
    jsonb_build_object('date', '2026-11-04', 'description', 'Estorno', 'amount', -10.00, 'category', 'Outras',
      'installment_n', null, 'installment_total', null, 'expense_id', null, 'plan', null))));

select is((select count(*) from public.installment_plans)::int, 1, 'plan.create creates a plan');
select is((select installment_amount from public.installment_plans), 100.00, 'plan amount = item amount');
select is((select description from public.installment_plans), 'LOJA X', 'plan description is normalized');

-- Second import of the same card/month: links the plan created above.
select public.save_imported_invoice(jsonb_build_object(
  'household_id', 'bbbbbbbb-1111-0000-0000-000000000000', 'card_id', 'bbbbbbbb-3333-0000-0000-000000000000',
  'due_month', '2026-12-01', 'due_date', '2026-12-10', 'total', 301.00, 'source', 'pdf', 'pdf_path', 'x/2.pdf',
  'items', jsonb_build_array(
    jsonb_build_object('date', '2026-11-02', 'description', 'Loja X 02/10', 'amount', 100.00, 'category', 'Outras',
      'installment_n', 2, 'installment_total', 10, 'expense_id', null,
      'plan', jsonb_build_object('link', (select id from public.installment_plans))),
    jsonb_build_object('date', '2026-11-03', 'description', 'Mercado', 'amount', 150.00, 'category', 'Alimentação',
      'installment_n', null, 'installment_total', null, 'expense_id', null, 'plan', null),
    jsonb_build_object('date', '2026-11-04', 'description', 'Estorno', 'amount', -10.00, 'category', 'Outras',
      'installment_n', null, 'installment_total', null, 'expense_id', null, 'plan', null))));

select is((select count(*) from public.invoices)::int, 1, 'save_imported_invoice replaces: one invoice');
select is((select count(*) from public.invoice_items)::int, 3, 'save_imported_invoice replaces: three items');
select is((select count(*) from public.installment_plans)::int, 1, 'link reuses the plan: exactly one plan');
select is((select total from public.invoices), 301.00, 'saved total is the reviewed total');

select throws_ok($$select public.save_imported_invoice(jsonb_build_object(
  'household_id', 'bbbbbbbb-1111-0000-0000-000000000000', 'card_id', 'bbbbbbbb-3333-0000-0000-000000000099',
  'due_month', '2026-12-01', 'due_date', '2026-12-10', 'total', 1, 'source', 'manual', 'pdf_path', null,
  'items', '[]'::jsonb))$$, 'P0001', null, 'card of another household is rejected');

select is(public.normalize_description('Café PARC 03 DE 10'), 'CAFE', 'normalize_description matches the TS rule');

select * from finish();
rollback;
