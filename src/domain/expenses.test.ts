import { describe, it, expect } from 'vitest';
import { seedSnapshot, seedExpenses } from './fixtures';
import { isActiveIn, entryFor, cashExpensesFor, cardFixedExpensesFor, payrollDeductionsFor } from './expenses';
import type { Expense, Snapshot } from './types';

const byId = (id: string) => seedExpenses.find((e) => e.id === id)!;
const condo = byId('e-condominio');
const pnr = byId('e-pnr');

describe('isActiveIn', () => {
  it('fixed expense is active from start and inactive before', () => {
    expect(isActiveIn(condo, '2026-11')).toBe(true);
    expect(isActiveIn(condo, '2025-12')).toBe(false);
  });
  it('respects endMonth', () => {
    const e = { ...condo, endMonth: '2026-06' };
    expect(isActiveIn(e, '2026-06')).toBe(true);
    expect(isActiveIn(e, '2026-07')).toBe(false);
  });
  it('one-off is active only in its month', () => {
    const e: Expense = { ...condo, isFixed: false, startMonth: '2026-05' };
    expect(isActiveIn(e, '2026-05')).toBe(true);
    expect(isActiveIn(e, '2026-06')).toBe(false);
    expect(isActiveIn(e, '2026-04')).toBe(false);
  });
});

describe('entryFor', () => {
  it('returns null when inactive', () => {
    expect(entryFor(condo, [], '2025-12')).toBeNull();
  });
  it('virtual entry uses default amount', () => {
    expect(entryFor(condo, [], '2026-11')).toEqual({ expenseId: 'e-condominio', month: '2026-11', amountCents: 100000, paid: false, paidAt: null });
  });
  it('persisted entry wins', () => {
    const pe = { expenseId: condo.id, month: '2026-11', amountCents: 98000, paid: true, paidAt: '2026-11-10' };
    expect(entryFor(condo, [pe], '2026-11')).toEqual(pe);
  });
  it('payroll-deducted is paid without entry and with persisted paid:false', () => {
    expect(entryFor(pnr, [], '2026-11')?.paid).toBe(true);
    const pe = { expenseId: pnr.id, month: '2026-11', amountCents: 60000, paid: false, paidAt: null };
    expect(entryFor(pnr, [pe], '2026-11')).toEqual({ ...pe, paid: true });
  });
});

describe('lists', () => {
  const card: Expense = { ...condo, id: 'e-card', paymentMethod: 'card', cardId: 'c1' };
  const s: Snapshot = { ...seedSnapshot, expenses: [...seedExpenses, card] };
  it('cash excludes card expenses; card list includes them', () => {
    const cash = cashExpensesFor(s, '2026-11');
    expect(cash.map((x) => x.expense.id)).not.toContain('e-card');
    expect(cash).toHaveLength(11);
    expect(cardFixedExpensesFor(s, 'c1', '2026-11').map((x) => x.expense.id)).toEqual(['e-card']);
    expect(cardFixedExpensesFor(s, 'other', '2026-11')).toEqual([]);
  });
  it('payroll deductions per person', () => {
    expect(payrollDeductionsFor(seedSnapshot, 'p-thiago', '2026-11')).toEqual([67737]);
  });
});
