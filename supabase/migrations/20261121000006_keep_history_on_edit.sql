-- Editing a fixed expense or an income must not rewrite past months. Months without a persisted row are
-- computed from the CURRENT default, so before the default changes, every month from start_month to the month
-- before p_current_month (and not after end_month) that has no row gets one with the OLD values, in the same
-- transaction as the update. Months already persisted are left alone. Both run as the caller (RLS applies).
--
-- p_row: the expenses / incomes columns to change (missing keys keep their value; id and household_id are
-- ignored). p_current_month: the client's current month (day 1), so the boundary matches what the app shows.

create function public.update_expense(p_expense uuid, p_row jsonb, p_current_month date)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old public.expenses;
  v_new public.expenses;
begin
  select * into v_old from public.expenses e where e.id = p_expense for update;
  if not found then
    raise exception 'Despesa não encontrada.';
  end if;
  v_new := jsonb_populate_record(v_old, p_row);

  -- A one-off expense exists in one month only: editing it means changing that month.
  if v_old.is_fixed and (v_new.default_amount is distinct from v_old.default_amount
                         or v_new.payroll_deducted is distinct from v_old.payroll_deducted) then
    insert into public.expense_entries (household_id, expense_id, month, amount, paid)
    select v_old.household_id, v_old.id, m::date, v_old.default_amount, v_old.payroll_deducted
    from generate_series(v_old.start_month::timestamp,
      least((p_current_month - interval '1 month')::date, coalesce(v_old.end_month, p_current_month))::timestamp,
      interval '1 month') as m
    on conflict (expense_id, month) do nothing;
  end if;

  update public.expenses e set
    name = v_new.name, category = v_new.category, is_fixed = v_new.is_fixed, default_amount = v_new.default_amount,
    due_day = v_new.due_day, payroll_deducted = v_new.payroll_deducted, person_id = v_new.person_id,
    payment_method = v_new.payment_method, card_id = v_new.card_id, start_month = v_new.start_month,
    end_month = v_new.end_month, notes = v_new.notes
  where e.id = p_expense;
end;
$$;

revoke all on function public.update_expense(uuid, jsonb, date) from public;
grant execute on function public.update_expense(uuid, jsonb, date) to authenticated;

create function public.update_income(p_income uuid, p_row jsonb, p_current_month date)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old public.incomes;
  v_new public.incomes;
begin
  select * into v_old from public.incomes i where i.id = p_income for update;
  if not found then
    raise exception 'Receita não encontrada.';
  end if;
  v_new := jsonb_populate_record(v_old, p_row);

  if v_new.default_amount is distinct from v_old.default_amount then
    insert into public.income_overrides (household_id, income_id, month, amount)
    select v_old.household_id, v_old.id, m::date, v_old.default_amount
    from generate_series(v_old.start_month::timestamp,
      least((p_current_month - interval '1 month')::date, coalesce(v_old.end_month, p_current_month))::timestamp,
      interval '1 month') as m
    on conflict (income_id, month) do nothing;
  end if;

  update public.incomes i set
    name = v_new.name, person_id = v_new.person_id, gross = v_new.gross, discount = v_new.discount,
    discount_label = v_new.discount_label, default_amount = v_new.default_amount,
    start_month = v_new.start_month, end_month = v_new.end_month
  where i.id = p_income;
end;
$$;

revoke all on function public.update_income(uuid, jsonb, date) from public;
grant execute on function public.update_income(uuid, jsonb, date) to authenticated;
