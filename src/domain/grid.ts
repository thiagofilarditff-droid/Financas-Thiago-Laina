import type { Card, Cents, Month, Snapshot } from './types';
import { monthsOfYear } from './month';
import { incomeRowsFor } from './incomes';
import { entryFor, isActiveIn, cardFixedExpensesFor } from './expenses';
import { projectedItemsFor } from './installments';

export type CellState = 'paid' | 'pending' | 'projected' | 'none';
export interface GridCell { cents: Cents; state: CellState }
export interface GridRow {
  key: string; kind: 'income' | 'expense' | 'card'; refId: string; label: string; sublabel?: string;
  cells: Record<Month, GridCell>; breakdown?: Record<Month, { category: string; cents: Cents }[]>;
}
export interface MonthTotals { incomeCents: Cents; paidCents: Cents; expectedCents: Cents; balanceCents: Cents }
export interface MonthlyGrid {
  year: number; months: Month[]; incomeRows: GridRow[]; expenseRows: GridRow[];
  totals: Record<Month, MonthTotals>; paidCountYear: number;
}

// Projected installments carry no category of their own.
const PROJECTED_INSTALLMENT_CATEGORY = 'Outras';

const NONE: GridCell = { cents: 0, state: 'none' };

function groupByCategory(parts: { category: string; cents: Cents }[]): { category: string; cents: Cents }[] {
  const out: { category: string; cents: Cents }[] = [];
  for (const p of parts) {
    const hit = out.find((x) => x.category === p.category);
    if (hit) hit.cents += p.cents;
    else out.push({ category: p.category, cents: p.cents });
  }
  return out;
}

function buildIncomeRows(s: Snapshot, months: Month[]): GridRow[] {
  const rows = new Map<string, GridRow>();
  for (const m of months) {
    for (const r of incomeRowsFor(s, m)) {
      let row = rows.get(r.key);
      if (!row) {
        const refId = r.key.slice(r.key.indexOf(':') + 1);
        row = { key: r.key, kind: 'income', refId, label: r.label, cells: {} };
        rows.set(r.key, row);
      }
      row.cells[m] = { cents: r.cents, state: 'pending' };
    }
  }
  for (const row of rows.values()) for (const m of months) row.cells[m] ??= NONE;
  return [...rows.values()];
}

function buildExpenseRows(s: Snapshot, months: Month[]): GridRow[] {
  const rows: GridRow[] = [];
  for (const e of s.expenses) {
    if (e.paymentMethod !== 'cash' || !months.some((m) => isActiveIn(e, m))) continue;
    const cells: Record<Month, GridCell> = {};
    for (const m of months) {
      const entry = entryFor(e, s.entries, m);
      cells[m] = entry ? { cents: entry.amountCents, state: entry.paid ? 'paid' : 'pending' } : NONE;
    }
    rows.push({
      key: `expense:${e.id}`, kind: 'expense', refId: e.id, label: e.name,
      sublabel: e.payrollDeducted ? `${e.category} · em folha` : e.category, cells,
    });
  }
  return rows;
}

function buildCardRow(s: Snapshot, card: Card, months: Month[]): GridRow {
  const cells: Record<Month, GridCell> = {};
  const breakdown: Record<Month, { category: string; cents: Cents }[]> = {};
  for (const m of months) {
    const invoice = s.invoices.find((i) => i.cardId === card.id && i.dueMonth === m);
    if (invoice) {
      cells[m] = { cents: invoice.totalCents, state: invoice.paid ? 'paid' : 'pending' };
      breakdown[m] = groupByCategory(
        s.items.filter((it) => it.invoiceId === invoice.id).map((it) => ({ category: it.category, cents: it.amountCents })),
      );
      continue;
    }
    const parts = [
      ...projectedItemsFor(s.plans, s.items, s.invoices, card.id, m)
        .map((p) => ({ category: PROJECTED_INSTALLMENT_CATEGORY, cents: p.amountCents })),
      ...cardFixedExpensesFor(s, card.id, m).map((r) => ({ category: r.expense.category, cents: r.entry.amountCents })),
    ];
    const cents = parts.reduce((sum, p) => sum + p.cents, 0);
    cells[m] = cents === 0 ? NONE : { cents, state: 'projected' };
    breakdown[m] = groupByCategory(parts);
  }
  return { key: `card:${card.id}`, kind: 'card', refId: card.id, label: card.name, sublabel: 'Cartão', cells, breakdown };
}

export function buildMonthlyGrid(s: Snapshot, year: number): MonthlyGrid {
  const months = monthsOfYear(year);
  const incomeRows = buildIncomeRows(s, months);
  const cards = s.cards.filter(
    (c) => !c.archived || s.invoices.some((i) => i.cardId === c.id && months.includes(i.dueMonth)),
  );
  const expenseRows = [...buildExpenseRows(s, months), ...cards.map((c) => buildCardRow(s, c, months))];

  const totals: Record<Month, MonthTotals> = {};
  let paidCountYear = 0;
  for (const m of months) {
    const incomeCents = incomeRows.reduce((sum, r) => sum + r.cells[m].cents, 0);
    let paidCents = 0;
    let expectedCents = 0;
    for (const r of expenseRows) {
      const c = r.cells[m];
      if (c.state === 'none') continue;
      expectedCents += c.cents;
      if (c.state === 'paid') {
        paidCents += c.cents;
        paidCountYear++;
      }
    }
    totals[m] = { incomeCents, paidCents, expectedCents, balanceCents: incomeCents - expectedCents };
  }
  return { year, months, incomeRows, expenseRows, totals, paidCountYear };
}
