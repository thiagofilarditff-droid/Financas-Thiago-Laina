-- Atomic payslip save: upserts the payslip for (person, valid_from) and replaces its lines in one
-- transaction. Runs as the caller (security invoker), so row level security still applies.
create function public.save_payslip(p_household uuid, p_person uuid, p_valid_from date, p_lines jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.people where id = p_person and household_id = p_household) then
    raise exception 'Pessoa não pertence à casa informada.';
  end if;

  insert into public.payslips (household_id, person_id, valid_from)
  values (p_household, p_person, p_valid_from)
  on conflict (person_id, valid_from) do update set valid_from = excluded.valid_from
  returning id into v_id;

  delete from public.payslip_lines where payslip_id = v_id;

  insert into public.payslip_lines (household_id, payslip_id, kind, label, amount, sort_order)
  select p_household, v_id, l.kind, l.label, l.amount, l.sort_order
  from jsonb_to_recordset(p_lines) as l(kind text, label text, amount numeric, sort_order int);

  return v_id;
end;
$$;

grant execute on function public.save_payslip(uuid, uuid, date, jsonb) to authenticated;
