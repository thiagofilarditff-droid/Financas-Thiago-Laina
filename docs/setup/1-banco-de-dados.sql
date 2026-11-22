-- ORÇAMENTO DA CASA — estrutura do banco de dados
-- Cole este arquivo INTEIRO no SQL Editor do Supabase e clique em Run.
-- Só precisa rodar uma vez.

-- ===== 20261121000001_schema.sql =====
-- Orçamento doméstico: schema.
-- Money is numeric(12,2) (reais); months are `date` on day 1; every table carries household_id.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  primary key (user_id, household_id)
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  unique (household_id, name)
);

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  valid_from date not null check (extract(day from valid_from) = 1),
  unique (person_id, valid_from)
);

create table public.payslip_lines (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  payslip_id uuid not null references public.payslips (id) on delete cascade,
  kind text not null check (kind in ('provento', 'desconto')),
  label text not null,
  amount numeric(12,2) not null,
  sort_order int not null default 0 -- PayslipLine.order (`order` is reserved in SQL and PostgREST)
);

create table public.incomes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  person_id uuid references public.people (id) on delete set null,
  gross numeric(12,2),
  discount numeric(12,2),
  discount_label text,
  default_amount numeric(12,2) not null,
  start_month date not null check (extract(day from start_month) = 1),
  end_month date check (extract(day from end_month) = 1),
  check (end_month is null or end_month >= start_month)
);

create table public.income_overrides (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  income_id uuid not null references public.incomes (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount numeric(12,2) not null,
  unique (income_id, month)
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  bank text not null default '',
  brand text not null default '',
  last4 char(4) check (last4 ~ '^[0-9]{4}$'),
  holder_person_id uuid references public.people (id) on delete set null,
  limit_amount numeric(12,2) not null default 0, -- Card.limitCents (`limit` is reserved)
  closing_day int not null check (closing_day between 1 and 31),
  due_day int not null check (due_day between 1 and 31),
  color text not null default '#0f7a64',
  archived boolean not null default false
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  category text not null,
  is_fixed boolean not null default true,
  default_amount numeric(12,2) not null,
  due_day int check (due_day between 1 and 31),
  payroll_deducted boolean not null default false,
  person_id uuid references public.people (id) on delete set null,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card')),
  card_id uuid references public.cards (id) on delete restrict,
  start_month date not null check (extract(day from start_month) = 1),
  end_month date check (extract(day from end_month) = 1),
  notes text,
  check (end_month is null or end_month >= start_month),
  check (payment_method = 'card' or card_id is null)
);

create table public.expense_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  expense_id uuid not null references public.expenses (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount numeric(12,2) not null,
  paid boolean not null default false,
  paid_at timestamptz,
  paid_by uuid references auth.users (id) on delete set null,
  unique (expense_id, month)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete restrict,
  due_month date not null check (extract(day from due_month) = 1),
  due_date date not null,
  total numeric(12,2) not null,
  paid boolean not null default false,
  paid_at timestamptz,
  pdf_path text,
  source text not null default 'manual' check (source in ('pdf', 'manual')),
  imported_at timestamptz,
  unique (card_id, due_month),
  check (date_trunc('month', due_date)::date = due_month)
);

create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete restrict,
  description text not null,
  installment_amount numeric(12,2) not null,
  total_installments int not null check (total_installments >= 1),
  first_due_month date not null check (extract(day from first_due_month) = 1),
  purchase_date date
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  date date,
  description text not null,
  amount numeric(12,2) not null,
  category text not null,
  installment_n int check (installment_n >= 1),
  installment_total int check (installment_total >= 1),
  plan_id uuid references public.installment_plans (id) on delete set null,
  expense_id uuid references public.expenses (id) on delete set null,
  source text not null default 'imported' check (source in ('imported', 'manual')),
  check (installment_n is null or installment_total is null or installment_n <= installment_total)
);

create table public.sheet_exports (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  year int not null,
  spreadsheet_id text not null,
  url text not null,
  unique (user_id, year)
);

-- Foreign-key lookups used by the snapshot and cascades.
create index on public.household_members (household_id);
create index on public.people (household_id);
create index on public.payslips (household_id);
create index on public.payslip_lines (payslip_id);
create index on public.incomes (household_id);
create index on public.income_overrides (household_id);
create index on public.cards (household_id);
create index on public.expenses (household_id);
create index on public.expense_entries (household_id);
create index on public.invoices (household_id);
create index on public.installment_plans (household_id);
create index on public.invoice_items (invoice_id);
create index on public.invoice_items (household_id);

-- ===== 20261121000002_rls.sql =====
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

-- ===== 20261121000003_save_payslip.sql =====
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

-- ===== 20261121000004_functions.sql =====
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

-- ===== 20261121000005_import_plan_origin.sql =====
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

-- ===== 20261121000006_keep_history_on_edit.sql =====
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


-- ===== 20261121000007_grants.sql =====
-- Hosted Supabase projects may not grant table access to logged-in users by default.
-- Row Level Security (every table has it enabled) still limits each user to their own household.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
