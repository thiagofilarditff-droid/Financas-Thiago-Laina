-- Row level security: a row is visible/writable only to members of its household.

create function public.is_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

revoke all on function public.is_member(uuid) from public;
grant execute on function public.is_member(uuid) to authenticated;

alter table public.households enable row level security;
-- Members may read and rename their household, never create or delete it (delete would cascade everything).
create policy household_read on public.households for select to authenticated
  using (public.is_member(id));
create policy household_update on public.households for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));

-- Memberships are managed by the seed / an admin only; members can read their household's list.
alter table public.household_members enable row level security;
create policy member_read on public.household_members for select to authenticated
  using (public.is_member(household_id));

do $$
declare t text;
begin
  foreach t in array array[
    'people', 'categories', 'payslips', 'payslip_lines', 'incomes', 'income_overrides',
    'cards', 'expenses', 'expense_entries', 'invoices', 'installment_plans',
    'invoice_items', 'sheet_exports'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy household_access on public.%I for all to authenticated '
      'using (public.is_member(household_id)) with check (public.is_member(household_id))', t);
  end loop;
end $$;

-- sheet_exports are per user inside the household.
drop policy household_access on public.sheet_exports;
create policy household_access on public.sheet_exports for all to authenticated
  using (public.is_member(household_id) and user_id = auth.uid())
  with check (public.is_member(household_id) and user_id = auth.uid());

-- Private bucket for invoice PDFs: objects live at {household_id}/{invoice_id}.pdf.
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

-- Compared as text so a malformed folder name is simply denied instead of raising a cast error.
create policy invoices_household_access on storage.objects for all to authenticated
  using (bucket_id = 'invoices' and (storage.foldername(name))[1] in (
    select m.household_id::text from public.household_members m where m.user_id = auth.uid()))
  with check (bucket_id = 'invoices' and (storage.foldername(name))[1] in (
    select m.household_id::text from public.household_members m where m.user_id = auth.uid()));
