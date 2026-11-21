import {
  rowToExpense, expenseToRow, rowToIncome, incomeToRow, rowToCard, cardToRow,
  rowToInvoice, invoiceToRow, rowToInvoiceItem, invoiceItemToRow, rowToPlan, planToRow,
  rowToEntry, entryToRow, rowToPayslip, payslipToRow, payslipLineToRow, monthToDate,
  type ExpenseRow,
} from './mappers';

const expenseRow: ExpenseRow = {
  id: 'e1', household_id: 'h1', name: 'Plano de saúde Laina/Valentina', category: 'Saúde',
  is_fixed: true, default_amount: '2581.24', due_day: 10, payroll_deducted: true, person_id: 'p2',
  payment_method: 'cash', card_id: null, start_month: '2026-01-01', end_month: null, notes: null,
};

test('rowToExpense converts numeric to cents and date to Month', () => {
  const e = rowToExpense(expenseRow);
  expect(e.defaultCents).toBe(258124);
  expect(e.startMonth).toBe('2026-01');
  expect(e.endMonth).toBeNull();
  expect(e.personId).toBe('p2');
});

test('expenseToRow inverts rowToExpense', () => {
  expect(expenseToRow(rowToExpense(expenseRow), 'h1')).toEqual({ ...expenseRow, default_amount: 2581.24 });
});

test('numeric arrives as number or string and cents never drift', () => {
  expect(rowToExpense({ ...expenseRow, default_amount: 0.29 }).defaultCents).toBe(29);
  expect(rowToExpense({ ...expenseRow, default_amount: '1145.52' }).defaultCents).toBe(114552);
  expect(monthToDate('2026-11')).toBe('2026-11-01');
});

test('income round-trips with overrides keyed by Month', () => {
  const row = {
    id: 'i1', household_id: 'h1', name: 'Remuneração Ministério da Defesa', person_id: 'p2',
    gross: '2000.00', discount: '600.00', discount_label: 'Imposto de Renda', default_amount: '1400.00',
    start_month: '2026-01-01', end_month: '2026-12-01',
  };
  const inc = rowToIncome(row, [{ id: 'o1', household_id: 'h1', income_id: 'i1', month: '2026-03-01', amount: '1500.50' }]);
  expect(inc).toMatchObject({ grossCents: 200000, discountCents: 60000, defaultCents: 140000, endMonth: '2026-12' });
  expect(inc.overrides).toEqual({ '2026-03': 150050 });
  expect(incomeToRow(inc, 'h1')).toEqual({ ...row, gross: 2000, discount: 600, default_amount: 1400 });
});

test('card, invoice, item, plan and entry round-trip', () => {
  const card = { id: 'c1', household_id: 'h1', name: 'Nubank', bank: 'Nubank', brand: 'Mastercard', last4: '1234',
    holder_person_id: 'p1', limit_amount: 15000, closing_day: 3, due_day: 10, color: '#0f7a64', archived: false };
  expect(rowToCard(card).limitCents).toBe(1500000);
  expect(cardToRow(rowToCard(card), 'h1')).toEqual(card);

  const inv = { id: 'v1', household_id: 'h1', card_id: 'c1', due_month: '2026-11-01', due_date: '2026-11-10',
    total: 1234.56, paid: true, paid_at: '2026-11-09T12:00:00+00:00', pdf_path: 'h1/v1.pdf', source: 'pdf' as const };
  expect(rowToInvoice(inv)).toMatchObject({ dueMonth: '2026-11', totalCents: 123456 });
  expect(invoiceToRow(rowToInvoice(inv), 'h1')).toEqual(inv);

  const item = { id: 't1', household_id: 'h1', invoice_id: 'v1', date: '2026-10-03', description: 'Loja 03/10',
    amount: -12.3, category: 'Outras', installment_n: 3, installment_total: 10, plan_id: 'pl1', expense_id: null,
    source: 'imported' as const };
  expect(rowToInvoiceItem(item).amountCents).toBe(-1230);
  expect(invoiceItemToRow(rowToInvoiceItem(item), 'h1', 'imported')).toEqual(item);

  const plan = { id: 'pl1', household_id: 'h1', card_id: 'c1', description: 'Loja', installment_amount: 99.9,
    total_installments: 10, first_due_month: '2026-11-01', purchase_date: null };
  expect(rowToPlan(plan).firstDueMonth).toBe('2026-11');
  expect(planToRow(rowToPlan(plan), 'h1')).toEqual(plan);

  const entry = { id: 'x1', household_id: 'h1', expense_id: 'e1', month: '2026-02-01', amount: 260.84,
    paid: false, paid_at: null, paid_by: null };
  expect(rowToEntry(entry)).toEqual({ expenseId: 'e1', month: '2026-02', amountCents: 26084, paid: false, paidAt: null });
  expect(entryToRow(rowToEntry(entry), 'h1')).toEqual({ household_id: 'h1', expense_id: 'e1', month: '2026-02-01',
    amount: 260.84, paid: false, paid_at: null });
});

test('payslip groups its lines in order', () => {
  const slip = rowToPayslip({ id: 's1', household_id: 'h1', person_id: 'p1', valid_from: '2026-01-01' }, [
    { id: 'l2', household_id: 'h1', payslip_id: 's1', kind: 'desconto', label: 'IRRF', amount: '3235.80', sort_order: 2 },
    { id: 'l1', household_id: 'h1', payslip_id: 's1', kind: 'provento', label: 'Soldo', amount: '9546.00', sort_order: 1 },
    { id: 'l9', household_id: 'h1', payslip_id: 'other', kind: 'provento', label: 'X', amount: '1', sort_order: 0 },
  ]);
  expect(slip.validFrom).toBe('2026-01');
  expect(slip.lines).toEqual([
    { kind: 'provento', label: 'Soldo', amountCents: 954600, order: 1 },
    { kind: 'desconto', label: 'IRRF', amountCents: 323580, order: 2 },
  ]);
  expect(payslipToRow(slip, 'h1')).toEqual({ id: 's1', household_id: 'h1', person_id: 'p1', valid_from: '2026-01-01' });
  expect(payslipLineToRow(slip.lines[1], 's1', 'h1')).toEqual(
    { household_id: 'h1', payslip_id: 's1', kind: 'desconto', label: 'IRRF', amount: 3235.8, sort_order: 2 });
});
