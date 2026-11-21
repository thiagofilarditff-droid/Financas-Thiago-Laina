-- Installment plans created by an import are removed once no invoice item points at them any more, so a
-- re-import that reconciles differently (corrected amount, n/N, card...) or an invoice replaced by a manual
-- total / deleted does not leave a plan that projects its installments a second time.
-- Plans entered by hand (origin 'manual') are never removed implicitly.

alter table public.installment_plans
  add column origin text not null default 'manual' check (origin in ('import', 'manual'));

-- Deletes the card's imported plans that no invoice item points at; returns how many were deleted.
create function public.delete_orphan_import_plans(p_card uuid)
returns int
language sql
security invoker
set search_path = ''
as $$
  with gone as (
    delete from public.installment_plans p
    where p.card_id = p_card and p.origin = 'import'
      and not exists (select 1 from public.invoice_items i where i.plan_id = p.id)
    returning 1)
  select count(*)::int from gone;
$$;

revoke all on function public.delete_orphan_import_plans(uuid) from public;
grant execute on function public.delete_orphan_import_plans(uuid) to authenticated;

-- Same as in 20261121000004, plus: created plans are marked 'import' and orphaned imported plans are removed.
create or replace function public.save_imported_invoice(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household uuid := (payload ->> 'household_id')::uuid;
  v_card uuid := (payload ->> 'card_id')::uuid;
  v_due_month date := (payload ->> 'due_month')::date;
  v_source text := coalesce(payload ->> 'source', 'manual');
  v_paid boolean := false;
  v_paid_at timestamptz;
  v_invoice uuid;
  v_plan uuid;
  it jsonb;
begin
  if not exists (select 1 from public.cards c where c.id = v_card and c.household_id = v_household) then
    raise exception 'Cartão não pertence à casa informada.';
  end if;

  select i.paid, i.paid_at into v_paid, v_paid_at
  from public.invoices i where i.card_id = v_card and i.due_month = v_due_month;
  v_paid := coalesce(v_paid, false);

  delete from public.invoices i where i.card_id = v_card and i.due_month = v_due_month;

  insert into public.invoices (household_id, card_id, due_month, due_date, total, paid, paid_at, pdf_path, source, imported_at)
  values (v_household, v_card, v_due_month, (payload ->> 'due_date')::date, (payload ->> 'total')::numeric,
    v_paid, v_paid_at, payload ->> 'pdf_path', v_source, case when v_source = 'pdf' then now() end)
  returning id into v_invoice;

  for it in select * from jsonb_array_elements(coalesce(payload -> 'items', '[]'::jsonb)) loop
    v_plan := null;
    if jsonb_typeof(it -> 'plan') = 'object' and it -> 'plan' ? 'link' then
      v_plan := (it -> 'plan' ->> 'link')::uuid;
      if not exists (select 1 from public.installment_plans p
                     where p.id = v_plan and p.card_id = v_card and p.household_id = v_household) then
        raise exception 'Parcelamento não pertence a este cartão.';
      end if;
    elsif jsonb_typeof(it -> 'plan') = 'object' and it -> 'plan' ? 'create' then
      insert into public.installment_plans (household_id, card_id, description, installment_amount,
        total_installments, first_due_month, purchase_date, origin)
      values (v_household, v_card, public.normalize_description(it ->> 'description'), (it ->> 'amount')::numeric,
        (it ->> 'installment_total')::int, (it -> 'plan' -> 'create' ->> 'first_due_month')::date, (it ->> 'date')::date,
        'import')
      returning id into v_plan;
    end if;

    if it ->> 'expense_id' is not null and not exists (
      select 1 from public.expenses e where e.id = (it ->> 'expense_id')::uuid and e.household_id = v_household) then
      raise exception 'Despesa não pertence à casa informada.';
    end if;

    insert into public.invoice_items (household_id, invoice_id, date, description, amount, category,
      installment_n, installment_total, plan_id, expense_id, source)
    values (v_household, v_invoice, (it ->> 'date')::date, it ->> 'description', (it ->> 'amount')::numeric,
      it ->> 'category', (it ->> 'installment_n')::int, (it ->> 'installment_total')::int, v_plan,
      (it ->> 'expense_id')::uuid, 'imported');
  end loop;

  -- Plans created by an earlier import of the replaced invoice and not linked again would project twice.
  perform public.delete_orphan_import_plans(v_card);

  return v_invoice;
end;
$$;

-- Deletes one invoice (its items cascade) and the card's imported plans left with no items.
-- Returns the invoice's pdf_path so the caller can remove the stored PDF. Runs as the caller (RLS applies):
-- an invoice the caller cannot see is reported as not found.
create function public.delete_invoice(p_invoice uuid)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_card uuid;
  v_pdf text;
begin
  delete from public.invoices i where i.id = p_invoice returning i.card_id, i.pdf_path into v_card, v_pdf;
  if v_card is null then
    raise exception 'Fatura não encontrada.';
  end if;
  perform public.delete_orphan_import_plans(v_card);
  return v_pdf;
end;
$$;

revoke all on function public.delete_invoice(uuid) from public;
grant execute on function public.delete_invoice(uuid) to authenticated;
