import type { InvoiceItem, Month } from './types';
import type { GridRow, MonthlyGrid } from './grid';
import { fromCents } from './money';

type Cell = string | number;

const MONTH_HEADERS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
export const MONTHLY_HEADER: Cell[] = ['Item', ...MONTH_HEADERS, 'Total'];
export const INVOICES_HEADER: Cell[] = ['Vencimento', 'Cartão', 'Data', 'Descrição', 'Categoria', 'Parcela', 'Valor'];

export interface InvoiceItemExport { dueMonth: Month; dueDate: string; cardName: string; item: InvoiceItem }

const pad2 = (n: number) => String(n).padStart(2, '0');

/** A line of month values (cents, null = empty cell) plus its row total. */
function valueRow(label: string, perMonth: (number | null)[]): Cell[] {
  const total = perMonth.reduce<number>((sum, c) => sum + (c ?? 0), 0);
  return [label, ...perMonth.map((c) => (c === null ? '' : fromCents(c))), fromCents(total)];
}

function gridRowValues(grid: MonthlyGrid, row: GridRow): Cell[] {
  const perMonth = grid.months.map((m) => {
    const c = row.cells[m];
    if (row.kind === 'income') return c.cents;
    if (row.kind === 'expense') return c.state === 'paid' ? c.cents : null;
    return c.state === 'paid' || c.state === 'pending' ? c.cents : null;
  });
  return valueRow(row.label, perMonth);
}

const sectionRow = (label: string): Cell[] => [label, ...Array<Cell>(13).fill('')];

/** Values for both sheets, money in reais as numbers. */
export function buildSheetValues(
  grid: MonthlyGrid,
  items: InvoiceItemExport[],
): { monthly: Cell[][]; invoices: Cell[][] } {
  const totalOf = (pick: (t: MonthlyGrid['totals'][Month]) => number) => grid.months.map((m) => pick(grid.totals[m]));
  const monthly: Cell[][] = [
    MONTHLY_HEADER,
    sectionRow('RECEITAS'),
    ...grid.incomeRows.map((r) => gridRowValues(grid, r)),
    valueRow('Total das receitas', totalOf((t) => t.incomeCents)),
    sectionRow('DESPESAS'),
    ...grid.expenseRows.map((r) => gridRowValues(grid, r)),
    valueRow('Despesas pagas', totalOf((t) => t.paidCents)),
    valueRow('Despesas previstas', totalOf((t) => t.expectedCents)),
    valueRow('Saldo previsto', totalOf((t) => t.balanceCents)),
  ];

  const inYear = items.filter((i) => i.dueMonth.startsWith(`${grid.year}-`));
  const sorted = [...inYear].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate) || a.cardName.localeCompare(b.cardName) || (a.item.date ?? '').localeCompare(b.item.date ?? ''));
  const invoices: Cell[][] = [
    INVOICES_HEADER,
    ...sorted.map(({ item, cardName, dueDate }) => [
      dueDate, cardName, item.date ?? '', item.description, item.category,
      item.installmentN !== null && item.installmentTotal !== null ? `${pad2(item.installmentN)}/${pad2(item.installmentTotal)}` : '',
      fromCents(item.amountCents),
    ]),
  ];
  return { monthly, invoices };
}
