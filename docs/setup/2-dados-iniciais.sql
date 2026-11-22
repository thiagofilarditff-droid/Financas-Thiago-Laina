-- Dados iniciais do orçamento (Thiago & Laina).
-- Pode ser executado de novo sem risco: não faz nada se já existir uma casa (household).
-- Produção: troque os dois e-mails abaixo pelos e-mails cadastrados em Authentication → Users
-- e execute este arquivo inteiro no SQL Editor do Supabase.
do $$
declare
  thiago_email text := 'TROCAR';
  laina_email text := 'TROCAR';
  -- Só para desenvolvimento local (supabase/seed.local.sql define estes valores).
  local_thiago text := nullif(current_setting('seed.thiago_email', true), '');
  local_laina text := nullif(current_setting('seed.laina_email', true), '');
  start date := date '2026-01-01'; -- 1º mês dos contracheques e despesas iniciais
  hid uuid;
  thiago_user uuid;
  laina_user uuid;
  thiago uuid;
  laina uuid;
  slip uuid;
begin
  if exists (select 1 from public.households) then
    raise notice 'Já existe uma casa cadastrada; nada foi alterado.';
    return;
  end if;

  thiago_email := coalesce(local_thiago, thiago_email);
  laina_email := coalesce(local_laina, laina_email);

  select id into thiago_user from auth.users where lower(email) = lower(thiago_email);
  select id into laina_user from auth.users where lower(email) = lower(laina_email);
  if thiago_user is null or laina_user is null then
    raise exception 'Usuário não encontrado para "%" ou "%". Cadastre os dois em Authentication → Users e troque os e-mails no início deste arquivo.',
      thiago_email, laina_email;
  end if;

  insert into public.households (name) values ('Thiago & Laina') returning id into hid;
  insert into public.household_members (user_id, household_id)
    values (thiago_user, hid), (laina_user, hid);

  insert into public.people (household_id, name) values (hid, 'Thiago') returning id into thiago;
  insert into public.people (household_id, name) values (hid, 'Laina') returning id into laina;

  insert into public.categories (household_id, name)
  select hid, c from unnest(array[
    'Moradia', 'Saúde', 'Telefonia', 'Streamings', 'Educação',
    'Alimentação', 'Transporte', 'Lazer', 'Outras'
  ]) as c;

  -- Contracheque do Thiago
  insert into public.payslips (household_id, person_id, valid_from)
    values (hid, thiago, start) returning id into slip;
  insert into public.payslip_lines (household_id, payslip_id, kind, label, amount, sort_order) values
    (hid, slip, 'provento', 'Soldo Militar da Ativa', 9546.00, 1),
    (hid, slip, 'provento', 'Adicional de Habilitação', 4295.70, 2),
    (hid, slip, 'provento', 'Adicional Militar', 2100.12, 3),
    (hid, slip, 'provento', 'Adicional de Disponibilidade', 1145.52, 4),
    (hid, slip, 'desconto', 'Imposto de Renda (IRRF)', 3235.80, 5),
    (hid, slip, 'desconto', 'Pensão Militar Obrigatória', 1794.17, 6),
    (hid, slip, 'desconto', 'Assistência Médica Hospitalar (FAMHS)', 222.13, 7);

  -- Contracheque da Laina
  insert into public.payslips (household_id, person_id, valid_from)
    values (hid, laina, start) returning id into slip;
  insert into public.payslip_lines (household_id, payslip_id, kind, label, amount, sort_order) values
    (hid, slip, 'provento', 'Soldo Militar da Ativa', 12546.00, 1),
    (hid, slip, 'provento', 'Adicional de Habilitação', 5295.70, 2),
    (hid, slip, 'provento', 'Adicional Militar', 2100.12, 3),
    (hid, slip, 'provento', 'Adicional de Disponibilidade', 1145.52, 4),
    (hid, slip, 'desconto', 'Imposto de Renda (IRRF)', 6000.00, 5),
    (hid, slip, 'desconto', 'Pensão Militar Obrigatória', 1794.17, 6),
    (hid, slip, 'desconto', 'Assistência Médica Hospitalar (FAMHS)', 222.13, 7);

  insert into public.incomes
    (household_id, name, person_id, gross, discount, discount_label, default_amount, start_month)
  values
    (hid, 'Remuneração Ministério da Defesa', laina, 2000.00, 600.00, 'Imposto de Renda', 1400.00, start);

  -- Despesas fixas pagas em dinheiro/débito (sem cartões: eles cadastram os seus).
  insert into public.expenses
    (household_id, name, category, is_fixed, default_amount, due_day, payroll_deducted,
     person_id, payment_method, start_month)
  values
    (hid, 'Internet/claro', 'Moradia', true, 260.84, 10, false, null, 'cash', start),
    (hid, 'PNR', 'Moradia', true, 665.94, 5, true, null, 'cash', start),
    (hid, 'Condomínio SQS 214', 'Moradia', true, 1000.00, 10, false, null, 'cash', start),
    (hid, 'Conta de energia', 'Moradia', true, 400.00, 15, false, null, 'cash', start),
    (hid, 'Plano de saúde Laina/Valentina', 'Saúde', true, 2581.24, 10, true, laina, 'cash', start),
    (hid, 'Plano de saúde Thiago', 'Saúde', true, 677.37, 10, true, thiago, 'cash', start),
    (hid, 'Claro celular Laina', 'Telefonia', true, 101.90, 15, false, null, 'cash', start),
    (hid, 'Claro celular Valentina', 'Telefonia', true, 30.00, 15, false, null, 'cash', start),
    (hid, 'Claro Thiago', 'Telefonia', true, 119.00, 15, false, null, 'cash', start),
    (hid, 'Taya Advogados', 'Outras', true, 37.00, 10, true, null, 'cash', start),
    (hid, 'Clube da Aeronáutica', 'Outras', true, 260.00, 10, true, null, 'cash', start);

  raise notice 'Casa criada com sucesso (%).', hid;
end $$;
