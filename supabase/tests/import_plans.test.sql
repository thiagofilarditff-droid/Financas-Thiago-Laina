-- Installment plans created by an import are removed once no invoice item points at them any more
-- (re-import that reconciles differently, invoice replaced by a manual total, invoice deleted).
-- Plans entered by hand are never removed implicitly.
begin;
select plan(17);

insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001', 'd@plans.test'),
  ('cccccccc-0000-0000-0000-000000000002', 'e@plans.test');
insert into public.households (id, name) values
  ('cccccccc-1111-0000-0000-000000000000', 'Casa D'),
  ('cccccccc-1111-0000-0000-000000000099', 'Casa E');
insert into public.household_members (user_id, household_id) values
  ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-1111-0000-0000-000000000000'),
  ('cccccccc-0000-0000-0000-000000000002', 'cccccccc-1111-0000-0000-000000000099');
insert into public.cards (id, household_id, name, closing_day, due_day) values
  ('cccccccc-3333-0000-0000-000000000000', 'cccccccc-1111-0000-0000-000000000000', 'Nubank', 3, 10),
  ('cccccccc-3333-0000-0000-000000000099', 'cccccccc-1111-0000-0000-000000000099', 'Outro', 3, 10);
insert into public.invoices (id, household_id, card_id, due_month, due_date, total) values
  ('cccccccc-4444-0000-0000-000000000099', 'cccccccc-1111-0000-0000-000000000099',
   'cccccccc-3333-0000-0000-000000000099', '2026-12-01', '2026-12-10', 10);

create function pg_temp.import_dez(amount numeric, plan jsonb, pdf text) returns uuid language sql as $$
  select public.save_imported_invoice(jsonb_build_object(
    'household_id', 'cccccccc-1111-0000-0000-000000000000', 'card_id', 'cccccccc-3333-0000-0000-000000000000',
    'due_month', '2026-12-01', 'due_date', '2026-12-10', 'total', amount + 50, 'source', 'pdf', 'pdf_path', pdf,
    'items', jsonb_build_array(
      jsonb_build_object('date', '2026-11-02', 'description', 'Loja X 02/10', 'amount', amount, 'category', 'Outras',
        'installment_n', 2, 'installment_total', 10, 'expense_id', null, 'plan', plan),
      jsonb_build_object('date', '2026-11-03', 'description', 'Mercado', 'amount', 50.00, 'category', 'Alimentação',
        'installment_n', null, 'installment_total', null, 'expense_id', null, 'plan', null))));
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-000000000001", "role": "authenticated"}';

-- A plan entered by hand ("Compra parcelada") on the same card: it has no items and must survive everything below.
insert into public.installment_plans (household_id, card_id, description, installment_amount, total_installments, first_due_month)
values ('cccccccc-1111-0000-0000-000000000000', 'cccccccc-3333-0000-0000-000000000000', 'GELADEIRA', 250.00, 4, '2027-04-01');


-- 1. The first import creates a plan marked as created by an import.
select pg_temp.import_dez(100.00, '{"create": {"first_due_month": "2026-11-01"}}', 'h/1.pdf');
select is((select origin from public.installment_plans where description = 'LOJA X'), 'import', 'an imported plan has origin import');
select is((select origin from public.installment_plans where description = 'GELADEIRA'), 'manual', 'a hand-entered plan has origin manual');

-- 2. Re-import with a corrected amount: reconcile no longer links, so a new plan is created; the first one is left
--    with no items and is removed, so only one plan projects.
select pg_temp.import_dez(110.00, '{"create": {"first_due_month": "2026-11-01"}}', 'h/2.pdf');
select is((select count(*) from public.installment_plans where description = 'LOJA X')::int, 1,
  're-import with a different amount leaves one plan');
select is((select installment_amount from public.installment_plans where description = 'LOJA X'), 110.00,
  'the remaining plan is the corrected one');
select is((select count(*) from public.installment_plans where description = 'GELADEIRA')::int, 1, 'the manual plan is kept');

-- 3. Re-import linking the existing plan keeps it.
select pg_temp.import_dez(110.00, jsonb_build_object('link', (select id from public.installment_plans where description = 'LOJA X')), 'h/3.pdf');
select is((select count(*) from public.installment_plans where description = 'LOJA X')::int, 1, 'a linked plan is kept on re-import');

-- 4. Replacing the PDF invoice by a manual total removes its imported plans that no longer have items.
select public.save_imported_invoice(jsonb_build_object(
  'household_id', 'cccccccc-1111-0000-0000-000000000000', 'card_id', 'cccccccc-3333-0000-0000-000000000000',
  'due_month', '2026-12-01', 'due_date', '2026-12-10', 'total', 999.00, 'source', 'manual', 'pdf_path', null,
  'items', '[]'::jsonb));
select is((select count(*) from public.installment_plans where description = 'LOJA X')::int, 0,
  'replacing by a manual total removes the imported plan left with no items');
select is((select count(*) from public.installment_plans where description = 'GELADEIRA')::int, 1, 'the manual plan is still kept');

-- 5. delete_invoice: removes the invoice and its items, returns the PDF path, removes orphaned imported plans
--    but keeps an imported plan another invoice still points at.
select pg_temp.import_dez(100.00, '{"create": {"first_due_month": "2026-11-01"}}', 'h/4.pdf');
select public.save_imported_invoice(jsonb_build_object(
  'household_id', 'cccccccc-1111-0000-0000-000000000000', 'card_id', 'cccccccc-3333-0000-0000-000000000000',
  'due_month', '2027-01-01', 'due_date', '2027-01-10', 'total', 100.00, 'source', 'pdf', 'pdf_path', 'h/5.pdf',
  'items', jsonb_build_array(
    jsonb_build_object('date', '2026-11-02', 'description', 'Loja X 03/10', 'amount', 100.00, 'category', 'Outras',
      'installment_n', 3, 'installment_total', 10, 'expense_id', null,
      'plan', jsonb_build_object('link', (select id from public.installment_plans where description = 'LOJA X'))),
    jsonb_build_object('date', '2026-12-20', 'description', 'Celular 01/06', 'amount', 300.00, 'category', 'Outras',
      'installment_n', 1, 'installment_total', 6, 'expense_id', null,
      'plan', '{"create": {"first_due_month": "2027-01-01"}}'::jsonb))));
select is((select count(*) from public.installment_plans where origin = 'import')::int, 2, 'two imported plans before deleting');

select is(public.delete_invoice((select id from public.invoices where due_month = '2026-12-01')), 'h/4.pdf',
  'delete_invoice returns the PDF path to remove');
select is((select count(*) from public.invoices where due_month = '2026-12-01')::int, 0, 'the invoice is deleted');
select is((select count(*) from public.installment_plans where description = 'LOJA X')::int, 1,
  'an imported plan still used by another invoice is kept');

select is(public.delete_invoice((select id from public.invoices where due_month = '2027-01-01')), 'h/5.pdf',
  'the second invoice is deleted');
select is((select count(*) from public.invoice_items)::int, 0, 'its items cascade');
select is((select count(*) from public.installment_plans where origin = 'import')::int, 0,
  'imported plans left with no items are removed');
select is((select count(*) from public.installment_plans where description = 'GELADEIRA')::int, 1,
  'delete_invoice never removes a manual plan');

select throws_ok($$select public.delete_invoice('cccccccc-4444-0000-0000-000000000099')$$, 'P0001', null,
  'an invoice of another household cannot be deleted');

select * from finish();
rollback;
