-- Invoice import / manual invoice save.

-- Mirrors normalizeDescription() in src/domain/installments.ts: upper case, no accents, no "n/N" or
-- "n DE N" installment markers, no "PARC", only A-Z/0-9 separated by single spaces.
create function public.normalize_description(s text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        upper(translate(s,
          'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
          'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
        '\y\d{1,2}\s*(/|DE)\s*\d{1,2}\y', ' ', 'g'),
      '\yPARC\y', ' ', 'g'),
    '[^A-Z0-9]+', ' ', 'g'));
$$;

grant execute on function public.normalize_description(text) to authenticated;

-- Saves one invoice of a card for a due month in one transaction, replacing any invoice already saved
-- for that (card_id, due_month) (its items cascade). Creates or links installment plans per item.
-- Runs as the caller (security invoker), so row level security applies to every read and write.
--
-- payload: { household_id, card_id, due_month, due_date, total, source, pdf_path,
--            items: [{ date, description, amount, category, installment_n, installment_total, expense_id,
--                      plan: {"link": uuid} | {"create": {"first_due_month": date}} | null }] }
-- The replaced invoice's paid / paid_at are kept: replacing a manual total by the PDF does not unpay it.
create function public.save_imported_invoice(payload jsonb)
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
        total_installments, first_due_month, purchase_date)
      values (v_household, v_card, public.normalize_description(it ->> 'description'), (it ->> 'amount')::numeric,
        (it ->> 'installment_total')::int, (it -> 'plan' -> 'create' ->> 'first_due_month')::date, (it ->> 'date')::date)
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

  return v_invoice;
end;
$$;

revoke all on function public.save_imported_invoice(jsonb) from public;
grant execute on function public.save_imported_invoice(jsonb) to authenticated;
