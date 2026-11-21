import type { Cents, Month, Snapshot } from './types';
import { buildMonthlyGrid } from './grid';
import { compareMonth, currentMonth } from './month';
import { cardLimitUsedCents, futureInstallmentsCents, pendingInstallments } from './installments';

export interface DashboardKpis {
  incomeCents: Cents; expensesCents: Cents; pendingCents: Cents; surplusCents: Cents; surplusPct: number;
}
export interface DashboardBar { month: Month; incomeCents: Cents; expensesCents: Cents; future: boolean }
export interface DashboardBill {
  key: string; kind: 'expense' | 'card'; refId: string; invoiceId: string | null;
  label: string; sublabel: string; cents: Cents; paid: boolean; dueDay: number | null;
  /** False for payroll-deducted expenses (always paid) and for cards with no invoice yet. */
  canToggle: boolean;
}
export interface DashboardCard {
  cardId: string; name: string; holderName: string | null; color: string;
  invoiceCents: Cents; limitUsedCents: Cents; limitCents: Cents;
  futureInstallmentsCents: Cents; lastProjectedMonth: Month | null; openPlans: number;
}
export interface Dashboard {
  month: Month;
  kpis: DashboardKpis;
  incomes: { label: string; cents: Cents }[];
  bars: DashboardBar[];
  bills: DashboardBill[];
  categories: { category: string; cents: Cents }[];
  cards: DashboardCard[];
}

function addTo(map: Map<string, Cents>, category: string, cents: Cents) {
  map.set(category, (map.get(category) ?? 0) + cents);
}

export function buildDashboard(s: Snapshot, m: Month): Dashboard {
  const grid = buildMonthlyGrid(s, Number(m.slice(0, 4)));
  const today = currentMonth();
  const totals = grid.totals[m];

  const incomes = grid.incomeRows
    .filter((r) => r.cells[m].state !== 'none')
    .map((r) => ({
      label: r.key.startsWith('payslip:') ? (s.people.find((p) => p.id === r.refId)?.name ?? r.label) : r.label,
      cents: r.cells[m].cents,
    }));

  const bills: DashboardBill[] = [];
  const byCategory = new Map<string, Cents>();
  for (const row of grid.expenseRows) {
    const cell = row.cells[m];
    if (cell.state === 'none') continue;
    const paid = cell.state === 'paid';
    if (row.kind === 'card') {
      const card = s.cards.find((c) => c.id === row.refId)!;
      const invoiceId = s.invoices.find((i) => i.cardId === card.id && i.dueMonth === m)?.id ?? null;
      bills.push({
        key: row.key, kind: 'card', refId: card.id, invoiceId, label: card.name,
        sublabel: `Fatura · vence dia ${card.dueDay}`, cents: cell.cents, paid, dueDay: card.dueDay, canToggle: invoiceId !== null,
      });
      for (const p of row.breakdown?.[m] ?? []) addTo(byCategory, p.category, p.cents);
    } else {
      const e = s.expenses.find((x) => x.id === row.refId)!;
      bills.push({
        key: row.key, kind: 'expense', refId: e.id, invoiceId: null, label: e.name,
        sublabel: e.category, cents: cell.cents, paid, dueDay: e.dueDay, canToggle: !e.payrollDeducted,
      });
      addTo(byCategory, e.category, cell.cents);
    }
  }
  bills.sort((a, b) => Number(b.paid) - Number(a.paid) || (a.dueDay ?? 99) - (b.dueDay ?? 99));

  // A share chart cannot show negatives (e.g. an invoice whose items exceed its total), so only positive shares stay.
  const categories = [...byCategory].map(([category, cents]) => ({ category, cents }))
    .filter((c) => c.cents > 0)
    .sort((a, b) => b.cents - a.cents);

  const cards: DashboardCard[] = grid.expenseRows.filter((r) => r.kind === 'card').map((row) => {
    const card = s.cards.find((c) => c.id === row.refId)!;
    const future = pendingInstallments(s.plans, s.items, card.id).filter((p) => compareMonth(p.dueMonth, m) > 0);
    const lastProjectedMonth = future.reduce<Month | null>(
      (last, p) => (last === null || compareMonth(p.dueMonth, last) > 0 ? p.dueMonth : last), null);
    return {
      cardId: card.id, name: card.name, color: card.color,
      holderName: s.people.find((p) => p.id === card.holderPersonId)?.name ?? null,
      invoiceCents: row.cells[m].cents,
      limitUsedCents: cardLimitUsedCents(s, card.id, m), limitCents: card.limitCents,
      futureInstallmentsCents: futureInstallmentsCents(s.plans, s.items, s.invoices, card.id, m),
      lastProjectedMonth, openPlans: new Set(future.map((p) => p.planId)).size,
    };
  });

  const surplusCents = totals.incomeCents - totals.expectedCents;
  return {
    month: m,
    kpis: {
      incomeCents: totals.incomeCents, expensesCents: totals.expectedCents,
      pendingCents: totals.expectedCents - totals.paidCents, surplusCents,
      surplusPct: totals.incomeCents > 0 ? Math.round((surplusCents / totals.incomeCents) * 100) : 0,
    },
    incomes,
    bars: grid.months.map((month) => ({
      month, incomeCents: grid.totals[month].incomeCents, expensesCents: grid.totals[month].expectedCents,
      future: compareMonth(month, today) > 0,
    })),
    bills, categories, cards,
  };
}
