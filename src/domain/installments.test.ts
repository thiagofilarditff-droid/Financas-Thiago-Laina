import { describe, it, expect } from 'vitest';
import { seedSnapshot, nubankCard, tvPlan as tv } from './fixtures';
import {
  normalizeDescription, descriptionsMatch, installmentDueMonth, projectedItemsFor,
  reconcile, futureInstallmentsCents, cardLimitUsedCents, type ParsedItem,
} from './installments';
import type { Expense, Invoice, InvoiceItem, Snapshot } from './types';

const invoice = (id: string, dueMonth: string, totalCents: number, paid = false): Invoice => ({
  id, cardId: 'c1', dueMonth, dueDate: `${dueMonth}-10`, totalCents, paid, paidAt: null, pdfPath: null, source: 'pdf',
});
const inv202701 = invoice('inv-202701', '2027-01', 15000);
const item: InvoiceItem = {
  id: 'it-1', invoiceId: inv202701.id, date: null, description: 'MAGAZINE LUIZA 03/10', amountCents: 15000,
  category: 'Outras', installmentN: null, installmentTotal: null, planId: null, expenseId: null,
};
const p3: ParsedItem = { description: 'MAGALU MAGAZINE LUIZA', amountCents: 15001, installmentN: 3, installmentTotal: 10, date: null, category: 'Outras' };
const netflix: Expense = {
  id: 'e-netflix', name: 'Netflix', category: 'Streamings', isFixed: true, defaultCents: 5590, dueDay: 10,
  payrollDeducted: false, personId: null, paymentMethod: 'card', cardId: 'c1', startMonth: '2026-01', endMonth: null, notes: null,
};

describe('normalizeDescription / descriptionsMatch', () => {
  it('normalizes accents, case and installment suffix', () => {
    expect(normalizeDescription('Magazine Luíza 03/10')).toBe('MAGAZINE LUIZA');
    expect(normalizeDescription('Loja X 3 DE 10')).toBe('LOJA X');
    expect(normalizeDescription('LOJA X PARC 02/05')).toBe('LOJA X');
  });
  it('matches by containment, equality and token jaccard', () => {
    expect(descriptionsMatch('NETFLIX.COM', 'Netflix')).toBe(true);
    expect(descriptionsMatch('MAGALU MAGAZINE LUIZA', 'MAGAZINE LUIZA')).toBe(true);
    expect(descriptionsMatch('AMAZON MARKETPLACE BR', 'MARKETPLACE BR SHOP')).toBe(true);
    expect(descriptionsMatch('NETFLIX', 'SPOTIFY')).toBe(false);
  });
});

describe('projection', () => {
  it('computes installment due month', () => {
    expect(installmentDueMonth(tv, 1)).toBe('2026-11');
    expect(installmentDueMonth(tv, 10)).toBe('2027-08');
  });
  it('projects across year boundary', () => {
    expect(projectedItemsFor([tv], [], [], 'c1', '2027-01')[0].installmentN).toBe(3);
    expect(projectedItemsFor([tv], [], [], 'c1', '2027-08')[0].installmentN).toBe(10);
    expect(projectedItemsFor([tv], [], [], 'c1', '2027-09')).toEqual([]);
    expect(projectedItemsFor([tv], [], [], 'c1', '2026-10')).toEqual([]);
  });
  it('returns full projected item shape and filters by card', () => {
    expect(projectedItemsFor([tv], [], [], 'c1', '2027-01')).toEqual([{
      planId: tv.id, cardId: 'c1', description: 'MAGAZINE LUIZA', amountCents: 15000,
      installmentN: 3, installmentTotal: 10, dueMonth: '2027-01',
    }]);
    expect(projectedItemsFor([tv], [], [], 'c2', '2027-01')).toEqual([]);
  });
  it('real item hides its projection', () => {
    expect(projectedItemsFor([tv], [{ ...item, planId: tv.id, installmentN: 3 }], [inv202701], 'c1', '2027-01')).toEqual([]);
  });
  it('real item of another installment does not hide it', () => {
    expect(projectedItemsFor([tv], [{ ...item, planId: tv.id, installmentN: 2 }], [inv202701], 'c1', '2027-01')).toHaveLength(1);
  });
});

describe('reconcile', () => {
  it('links 03/10 in next year', () => {
    const [r] = reconcile([p3], [tv], [], 'c1', '2027-01');
    expect(r.planAction).toEqual({ type: 'link', planId: tv.id });
    expect(r.expenseId).toBeNull();
    expect(r.description).toBe('MAGALU MAGAZINE LUIZA');
  });
  it('creates plan when amount differs by more than 1 cent', () => {
    const [r] = reconcile([{ ...p3, amountCents: 15003 }], [tv], [], 'c1', '2027-01');
    expect(r.planAction).toEqual({ type: 'create', firstDueMonth: '2026-11' });
  });
  it('creates plan when card, total or first month differ', () => {
    expect(reconcile([p3], [tv], [], 'c2', '2027-01')[0].planAction).toEqual({ type: 'create', firstDueMonth: '2026-11' });
    expect(reconcile([{ ...p3, installmentTotal: 12 }], [tv], [], 'c1', '2027-01')[0].planAction).toEqual({ type: 'create', firstDueMonth: '2026-11' });
    expect(reconcile([p3], [tv], [], 'c1', '2027-02')[0].planAction).toEqual({ type: 'create', firstDueMonth: '2026-12' });
  });
  it('re-import of same invoice links, never creates a second plan', () => {
    // tv already has a real item for n=3 in 2027-01 (first import)
    const [r] = reconcile([p3], [tv], [], 'c1', '2027-01');
    expect(r.planAction).toEqual({ type: 'link', planId: tv.id });
  });
  it('two items in one invoice cannot link to the same plan', () => {
    const [a, b] = reconcile([p3, p3], [tv], [], 'c1', '2027-01');
    expect(a.planAction).toEqual({ type: 'link', planId: tv.id });
    expect(b.planAction).toEqual({ type: 'create', firstDueMonth: '2026-11' });
  });
  it('links non-installment item to fixed card expense', () => {
    const base = { description: 'NETFLIX.COM', amountCents: 5590, installmentN: null, installmentTotal: null, date: null, category: 'Streamings' };
    const [r] = reconcile([base], [tv], [netflix], 'c1', '2027-01');
    expect(r.expenseId).toBe('e-netflix');
    expect(r.planAction).toBeNull();
    expect(reconcile([{ ...base, amountCents: 6200 }], [tv], [netflix], 'c1', '2027-01')[0].expenseId).toBeNull();
    expect(reconcile([base], [tv], [{ ...netflix, cardId: 'c2' }], 'c1', '2027-01')[0].expenseId).toBeNull();
  });
});

describe('limit used', () => {
  it('sums future installments after a month', () => {
    expect(futureInstallmentsCents([tv], [], [], 'c1', '2027-06')).toBe(30000);
  });
  it('unpaid invoices plus future installments', () => {
    const s: Snapshot = {
      ...seedSnapshot, cards: [nubankCard], plans: [tv],
      invoices: [invoice('inv-202611', '2026-11', 99999, true), invoice('inv-202612', '2026-12', 154137)],
    };
    expect(cardLimitUsedCents(s, 'c1', '2026-11')).toBe(274137);
  });
});
