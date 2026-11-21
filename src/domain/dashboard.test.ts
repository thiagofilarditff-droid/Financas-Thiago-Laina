import { describe, it, expect } from 'vitest';
import { seedSnapshot, nubankCard, tvPlan } from './fixtures';
import { buildDashboard } from './dashboard';
import { compareMonth, currentMonth } from './month';
import type { Invoice, Snapshot } from './types';

const dezInvoice: Invoice = {
  id: 'inv-dez', cardId: 'c1', dueMonth: '2026-12', dueDate: '2026-12-10', totalCents: 154137,
  paid: false, paidAt: null, pdfPath: null, source: 'manual',
};

const s: Snapshot = { ...seedSnapshot, cards: [nubankCard], plans: [tvPlan], invoices: [dezInvoice] };

describe('buildDashboard', () => {
  const d = buildDashboard(s, '2026-11');

  it('KPIs: income, expenses, pending = unpaid bills, surplus and its share of income', () => {
    expect(d.kpis.incomeCents).toBe(2630628);
    expect(d.kpis.expensesCents).toBe(613329 + 15000);
    expect(d.kpis.surplusCents).toBe(d.kpis.incomeCents - d.kpis.expensesCents);
    const unpaid = d.bills.filter((b) => !b.paid).reduce((sum, b) => sum + b.cents, 0);
    expect(d.kpis.pendingCents).toBe(unpaid);
    expect(d.kpis.pendingCents).toBe(613329 + 15000 - 422155);
    expect(d.kpis.surplusPct).toBe(Math.round((d.kpis.surplusCents / d.kpis.incomeCents) * 100));
  });

  it('surplusPct is 0 without income', () => {
    expect(buildDashboard({ ...s, payslips: [], incomes: [] }, '2026-11').kpis.surplusPct).toBe(0);
  });

  it('lists the month incomes by person or income name', () => {
    expect(d.incomes.map((i) => i.label)).toEqual(['Thiago', 'Laina', 'Defesa']);
    expect(d.incomes[2].cents).toBe(140000);
  });

  it('bars: 12 months of the year, future after the current month', () => {
    expect(d.bars).toHaveLength(12);
    expect(d.bars.map((b) => b.month)[0]).toBe('2026-01');
    for (const b of d.bars) expect(b.future).toBe(compareMonth(b.month, currentMonth()) > 0);
    expect(d.bars[10]).toMatchObject({ incomeCents: 2630628, expensesCents: 628329 });
  });

  it('categories are sorted descending, drop zeros and include Saúde = 325861', () => {
    const cents = d.categories.map((c) => c.cents);
    expect(cents).toEqual([...cents].sort((a, b) => b - a));
    expect(cents.every((c) => c > 0)).toBe(true);
    expect(d.categories.find((c) => c.category === 'Saúde')!.cents).toBe(325861);
    // Taya + Clube + projected TV installment (plan without real items → Outras)
    expect(d.categories.find((c) => c.category === 'Outras')!.cents).toBe(3700 + 26000 + 15000);
    expect(d.categories.reduce((sum, c) => sum + c.cents, 0)).toBe(d.kpis.expensesCents);
  });

  it('bills: expenses and cards of the month, paid first then by due day', () => {
    expect(d.bills).toHaveLength(12);
    const firstUnpaid = d.bills.findIndex((b) => !b.paid);
    expect(d.bills.slice(firstUnpaid).every((b) => !b.paid)).toBe(true);
    for (const group of [d.bills.slice(0, firstUnpaid), d.bills.slice(firstUnpaid)]) {
      const days = group.map((b) => b.dueDay ?? 99);
      expect(days).toEqual([...days].sort((a, b) => a - b));
    }
    expect(d.bills[0]).toMatchObject({ label: 'PNR', sublabel: 'Moradia', paid: true, dueDay: 5, canToggle: false });
    const condo = d.bills.find((b) => b.refId === 'e-condominio')!;
    expect(condo).toMatchObject({ kind: 'expense', cents: 100000, paid: false, dueDay: 10, canToggle: true });
    const card = d.bills.find((b) => b.kind === 'card')!;
    expect(card).toMatchObject({ label: 'Nubank', sublabel: 'Fatura · vence dia 10', cents: 15000, paid: false, dueDay: 10, invoiceId: null, canToggle: false });
  });

  it('card bill with a real invoice can be toggled', () => {
    const card = buildDashboard(s, '2026-12').bills.find((b) => b.kind === 'card')!;
    expect(card).toMatchObject({ cents: 154137, invoiceId: 'inv-dez', canToggle: true });
  });

  it('cards: invoice of the month, limit used, future installments and open plans', () => {
    expect(d.cards).toEqual([{
      cardId: 'c1', name: 'Nubank', holderName: 'Thiago', color: '#8a6fb0',
      invoiceCents: 15000, limitUsedCents: 154137 + 8 * 15000, limitCents: 1000000,
      futureInstallmentsCents: 9 * 15000, lastProjectedMonth: '2027-08', openPlans: 1,
    }]);
  });

  it('a plan with nothing left after the month is not open', () => {
    const c = buildDashboard(s, '2027-08').cards[0];
    expect(c).toMatchObject({ futureInstallmentsCents: 0, lastProjectedMonth: null, openPlans: 0 });
  });
});
