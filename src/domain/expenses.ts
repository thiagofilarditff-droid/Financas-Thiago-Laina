import type { Cents, Expense, ExpenseEntry, Month, Snapshot } from './types';
import { compareMonth } from './month';

export function isActiveIn(e: Expense, m: Month): boolean {
  if (!e.isFixed) return m === e.startMonth;
  return compareMonth(m, e.startMonth) >= 0 && (e.endMonth === null || compareMonth(m, e.endMonth) <= 0);
}

export function entryFor(e: Expense, entries: ExpenseEntry[], m: Month): ExpenseEntry | null {
  if (!isActiveIn(e, m)) return null;
  const persisted = entries.find((x) => x.expenseId === e.id && x.month === m);
  if (persisted) return e.payrollDeducted ? { ...persisted, paid: true } : persisted;
  return { expenseId: e.id, month: m, amountCents: e.defaultCents, paid: e.payrollDeducted, paidAt: null };
}

type Row = { expense: Expense; entry: ExpenseEntry };

function rowsFor(s: Snapshot, m: Month, keep: (e: Expense) => boolean): Row[] {
  const rows: Row[] = [];
  for (const expense of s.expenses) {
    if (!keep(expense)) continue;
    const entry = entryFor(expense, s.entries, m);
    if (entry) rows.push({ expense, entry });
  }
  return rows;
}

export function cashExpensesFor(s: Snapshot, m: Month): Row[] {
  return rowsFor(s, m, (e) => e.paymentMethod === 'cash');
}

export function cardFixedExpensesFor(s: Snapshot, cardId: string, m: Month): Row[] {
  return rowsFor(s, m, (e) => e.paymentMethod === 'card' && e.cardId === cardId);
}

export function payrollDeductionsFor(s: Snapshot, personId: string, m: Month): Cents[] {
  return rowsFor(s, m, (e) => e.payrollDeducted && e.personId === personId).map((r) => r.entry.amountCents);
}
