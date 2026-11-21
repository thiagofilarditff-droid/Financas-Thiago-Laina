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
