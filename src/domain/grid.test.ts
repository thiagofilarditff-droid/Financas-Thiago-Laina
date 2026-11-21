import { describe, it, expect } from 'vitest';
import { seedSnapshot, nubankCard, tvPlan } from './fixtures';
import { buildMonthlyGrid } from './grid';
import type { Expense, Invoice, Snapshot } from './types';

const dezInvoice: Invoice = {
  id: 'inv-dez', cardId: 'c1', dueMonth: '2026-12', dueDate: '2026-12-10', totalCents: 154137,
  paid: false, paidAt: null, pdfPath: null, source: 'manual',
};

const s: Snapshot = { ...seedSnapshot, cards: [nubankCard], plans: [tvPlan], invoices: [dezInvoice] };

const netflix: Expense = {
  id: 'e-netflix', name: 'Netflix', category: 'Streamings', isFixed: true, defaultCents: 5590, dueDay: 10,
  payrollDeducted: false, personId: null, paymentMethod: 'card', cardId: 'c1', startMonth: '2026-01', endMonth: null, notes: null,
};

const cardRow = (g: ReturnType<typeof buildMonthlyGrid>) => g.expenseRows.find((r) => r.kind === 'card' && r.refId === 'c1')!;

describe('buildMonthlyGrid', () => {
  it('lists the 12 months of the year', () => {
    const g = buildMonthlyGrid(s, 2026);
    expect(g.year).toBe(2026);
    expect(g.months).toHaveLength(12);
    expect(g.months[10]).toBe('2026-11');
  });

  it('November total income is 2630628', () => {
    expect(buildMonthlyGrid(s, 2026).totals['2026-11'].incomeCents).toBe(2630628);
  });

  it('income rows come from incomeRowsFor', () => {
    const g = buildMonthlyGrid(s, 2026);
    expect(g.incomeRows.map((r) => r.key)).toEqual(['payslip:p-thiago', 'payslip:p-laina', 'income:inc-defesa']);
    expect(g.incomeRows.every((r) => r.kind === 'income')).toBe(true);
    expect(g.incomeRows[2].cells['2026-11'].cents).toBe(140000);
  });

  it('December card cell is the invoice total, pending', () => {
    expect(cardRow(buildMonthlyGrid(s, 2026)).cells['2026-12']).toEqual({ cents: 154137, state: 'pending' });
  });

  it('paid invoice yields a paid card cell', () => {
    const paid = { ...s, invoices: [{ ...dezInvoice, paid: true }] };
    expect(cardRow(buildMonthlyGrid(paid, 2026)).cells['2026-12']).toEqual({ cents: 154137, state: 'paid' });
  });

  it('January 2027 card cell is a projected installment', () => {
    expect(cardRow(buildMonthlyGrid(s, 2027)).cells['2027-01']).toEqual({ cents: 15000, state: 'projected' });
  });

  it('card cell is none when nothing is projected', () => {
    expect(cardRow(buildMonthlyGrid(s, 2026)).cells['2026-10']).toEqual({ cents: 0, state: 'none' });
  });

  it('card row uses card name, Cartão sublabel and comes after expense rows', () => {
    const g = buildMonthlyGrid(s, 2026);
    const last = g.expenseRows[g.expenseRows.length - 1];
    expect(last).toMatchObject({ kind: 'card', refId: 'c1', label: 'Nubank', sublabel: 'Cartão' });
    expect(g.expenseRows).toHaveLength(12);
  });

  it('PNR cells are paid all year', () => {
    const pnr = buildMonthlyGrid(s, 2026).expenseRows.find((r) => r.refId === 'e-pnr')!;
    expect(pnr.label).toBe('PNR');
    expect(pnr.sublabel).toBe('Moradia · em folha');
    for (const m of Object.keys(pnr.cells)) expect(pnr.cells[m].state).toBe('paid');
  });

  it('non payroll expense is pending by default and paid when the entry is paid', () => {
    const withPaid = { ...s, entries: [{ expenseId: 'e-condominio', month: '2026-11', amountCents: 100000, paid: true, paidAt: '2026-11-10' }] };
    const row = buildMonthlyGrid(withPaid, 2026).expenseRows.find((r) => r.refId === 'e-condominio')!;
    expect(row.sublabel).toBe('Moradia');
    expect(row.cells['2026-10']).toEqual({ cents: 100000, state: 'pending' });
    expect(row.cells['2026-11']).toEqual({ cents: 100000, state: 'paid' });
  });

  it('inactive months are none and expenses inactive all year get no row', () => {
    const late: Expense = { ...seedSnapshot.expenses[0], id: 'e-late', startMonth: '2026-06' };
    const future: Expense = { ...seedSnapshot.expenses[0], id: 'e-future', startMonth: '2027-03' };
    const g = buildMonthlyGrid({ ...s, expenses: [...s.expenses, late, future] }, 2026);
    const row = g.expenseRows.find((r) => r.refId === 'e-late')!;
    expect(row.cells['2026-05']).toEqual({ cents: 0, state: 'none' });
    expect(row.cells['2026-06'].state).toBe('pending');
    expect(g.expenseRows.find((r) => r.refId === 'e-future')).toBeUndefined();
  });

  it('card-paid fixed expense creates no row and adds to the projected card cell', () => {
    const g = buildMonthlyGrid({ ...s, expenses: [...s.expenses, netflix] }, 2027);
    expect(g.expenseRows.find((r) => r.refId === 'e-netflix')).toBeUndefined();
    const row = cardRow(g);
    expect(row.cells['2027-01']).toEqual({ cents: 20590, state: 'projected' });
    expect(row.breakdown!['2027-01']).toEqual([
      { category: 'Outras', cents: 15000 },
      { category: 'Streamings', cents: 5590 },
    ]);
  });

  it('breakdown of a month with an invoice groups real items by category', () => {
    const items = [
      { id: 'i1', invoiceId: 'inv-dez', date: null, description: 'A', amountCents: 100000, category: 'Alimentação', installmentN: null, installmentTotal: null, planId: null, expenseId: null },
      { id: 'i2', invoiceId: 'inv-dez', date: null, description: 'B', amountCents: 39137, category: 'Lazer', installmentN: null, installmentTotal: null, planId: null, expenseId: null },
      { id: 'i3', invoiceId: 'inv-dez', date: null, description: 'MAGAZINE LUIZA 02/10', amountCents: 15000, category: 'Alimentação', installmentN: 2, installmentTotal: 10, planId: 'plan-tv', expenseId: null },
    ];
    const g = buildMonthlyGrid({ ...s, items }, 2026);
    expect(cardRow(g).breakdown!['2026-12']).toEqual([
      { category: 'Alimentação', cents: 115000 },
      { category: 'Lazer', cents: 39137 },
    ]);
  });

  it('archived cards keep a row only when they have an invoice in the year', () => {
    const archived = { ...s, cards: [{ ...nubankCard, archived: true }] };
    expect(buildMonthlyGrid(archived, 2026).expenseRows.some((r) => r.kind === 'card')).toBe(true);
    expect(buildMonthlyGrid(archived, 2027).expenseRows.some((r) => r.kind === 'card')).toBe(false);
  });

  it('expectedCents of 2026-11 is the seed expenses plus the card cell; balance = income − expected', () => {
    const g = buildMonthlyGrid(s, 2026);
    const t = g.totals['2026-11'];
    const card = cardRow(g).cells['2026-11'];
    expect(card).toEqual({ cents: tvPlan.installmentCents, state: 'projected' });
    const expenseSum = g.expenseRows.filter((r) => r.kind === 'expense').reduce((sum, r) => sum + r.cells['2026-11'].cents, 0);
    expect(expenseSum).toBe(613329);
    expect(t.expectedCents).toBe(613329 + card.cents);
    expect(t.balanceCents).toBe(t.incomeCents - t.expectedCents);
  });

  it('paidCents sums paid cells and paidCountYear counts paid expense/card cells', () => {
    const g = buildMonthlyGrid(s, 2026);
    // payroll-deducted seed expenses: PNR, 2 saúde, Taya, Clube = 66594+258124+67737+3700+26000
    expect(g.totals['2026-11'].paidCents).toBe(422155);
    expect(g.paidCountYear).toBe(5 * 12);
  });
});
