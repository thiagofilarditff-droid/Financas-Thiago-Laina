import { describe, it, expect } from 'vitest';
import { seedSnapshot, nubankCard, tvPlan } from './fixtures';
import { buildMonthlyGrid } from './grid';
import { buildSheetValues } from './sheetExport';
import { monthsOfYear } from './month';
import type { ExpenseEntry, Invoice, InvoiceItem, Snapshot } from './types';

const dezInvoice: Invoice = {
  id: 'inv-dez', cardId: 'c1', dueMonth: '2026-12', dueDate: '2026-12-10', totalCents: 154137,
  paid: false, paidAt: null, pdfPath: null, source: 'manual',
};
const tvItem: InvoiceItem = {
  id: 'i-tv', invoiceId: 'inv-dez', date: '2026-11-20', description: 'MAGAZINE LUIZA 03/10', amountCents: 15000,
  category: 'Lazer', installmentN: 3, installmentTotal: 10, planId: 'plan-tv', expenseId: null,
};
const pnrEntries: ExpenseEntry[] = monthsOfYear(2026).map((m) => ({
  expenseId: 'e-pnr', month: m, amountCents: 66594, paid: true, paidAt: null,
}));
const s: Snapshot = { ...seedSnapshot, cards: [nubankCard], plans: [tvPlan], invoices: [dezInvoice], items: [tvItem], entries: pnrEntries };
const grid = buildMonthlyGrid(s, 2026);
const values = buildSheetValues(grid, [{ dueMonth: '2026-12', dueDate: '2026-12-10', cardName: 'Nubank', item: tvItem }]);
const row = (label: string) => values.monthly.find((r) => r[0] === label)!;

describe('buildSheetValues', () => {
  it('has the header row first', () => {
    expect(values.monthly[0]).toEqual(['Item', 'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ', 'Total']);
  });
  it('writes income totals in reais as numbers (NOV = 26306.28)', () => {
    expect(row('Total das receitas')[11]).toBe(26306.28);
  });
  it('writes paid expenses with their amount in every month', () => {
    const pnr = row('PNR');
    expect(pnr.slice(1, 13)).toEqual(Array(12).fill(665.94));
    expect(pnr[13]).toBe(7991.28);
  });
  it('leaves unpaid expenses empty', () => {
    const c = row('Condomínio SQS 214');
    expect(c[1]).toBe('');
    expect(c[13]).toBe(0);
  });
  it('exports the invoice total for a card row with an invoice, empty when projected', () => {
    const card = row('Nubank');
    expect(card[12]).toBe(1541.37);
    expect(card[11]).toBe(''); // projected installment only
  });
  it('has the section and total rows', () => {
    const labels = values.monthly.map((r) => r[0]);
    for (const l of ['RECEITAS', 'Total das receitas', 'DESPESAS', 'Despesas pagas', 'Despesas previstas', 'Saldo previsto']) {
      expect(labels).toContain(l);
    }
    expect(row('Despesas pagas')[1]).toBe(grid.totals['2026-01'].paidCents / 100);
  });
  it('lists invoice items with parcela n/N', () => {
    expect(values.invoices[0]).toEqual(['Vencimento', 'Cartão', 'Data', 'Descrição', 'Categoria', 'Parcela', 'Valor']);
    expect(values.invoices).toContainEqual(['2026-12-10', 'Nubank', '2026-11-20', 'MAGAZINE LUIZA 03/10', 'Lazer', '03/10', 150]);
  });
});
