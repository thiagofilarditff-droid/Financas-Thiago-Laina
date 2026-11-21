// Pure rules of the invoice review screen: editable rows, the "Ajuste" line, the save payload and the
// messages shown when /api/parse-invoice fails.
import type { Cents, Month } from '../../domain/types';
import type { ParsedItem, ReconciledItem } from '../../domain/installments';
import { formatBRL, fromCents, parseBRL } from '../../domain/money';
import { toMonth } from '../../domain/month';

export const MAX_PDF_BYTES = 3 * 1024 * 1024;
export const PDF_TOO_LARGE = 'O PDF passa de 3 MB. Tente exportar a fatura de novo pelo app do banco.';
export const READ_FAILED = 'Não consegui ler esta fatura. Tente de novo ou lance o total à mão.';

export function sumCents(items: { amountCents: Cents }[]): Cents {
  return items.reduce((s, i) => s + i.amountCents, 0);
}

/** Invoice total minus the item sum (fees, IOF, advance payments); shown only when ≠ 0. */
export function adjustmentCents(totalCents: Cents, items: { amountCents: Cents }[]): Cents {
  return totalCents - sumCents(items);
}

/** One editable row of the review table, kept as typed text so partial input is not lost. */
export interface ReviewRow { date: string; description: string; amount: string; category: string; installment: string }

export function rowFromParsed(i: ParsedItem): ReviewRow {
  return {
    date: i.date ?? '', description: i.description, amount: formatBRL(i.amountCents), category: i.category,
    installment: i.installmentN !== null && i.installmentTotal !== null ? `${i.installmentN}/${i.installmentTotal}` : '',
  };
}

/** '' → no installment; '2/10' → 2 of 10; anything else (or n > N) → 'invalid'. */
export function parseInstallmentText(s: string): { n: number; total: number } | null | 'invalid' {
  const t = s.trim();
  if (!t) return null;
  const m = /^(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(t);
  if (!m) return 'invalid';
  const n = Number(m[1]);
  const total = Number(m[2]);
  return n >= 1 && total >= 1 && n <= total ? { n, total } : 'invalid';
}

/** The row as a ParsedItem, or null when the amount, description or installment is invalid. */
export function parsedFromRow(r: ReviewRow): ParsedItem | null {
  const cents = parseBRL(r.amount);
  const inst = parseInstallmentText(r.installment);
  if (cents === null || inst === 'invalid' || !r.description.trim() || !r.category) return null;
  if (r.date && !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return null;
  return {
    date: r.date || null, description: r.description.trim(), amountCents: cents, category: r.category,
    installmentN: inst?.n ?? null, installmentTotal: inst?.total ?? null,
  };
}

export type PlanPayload = { link: string } | { create: { first_due_month: string } } | null;

export interface SavePayload {
  household_id: string; card_id: string; due_month: string; due_date: string; total: number;
  source: 'pdf' | 'manual'; pdf_path: string | null;
  items: {
    date: string | null; description: string; amount: number; category: string;
    installment_n: number | null; installment_total: number | null; expense_id: string | null; plan: PlanPayload;
  }[];
}

const monthDate = (m: Month) => `${m}-01`;

/** Payload of the `save_imported_invoice` SQL function. The total is the reviewed one, never the item sum. */
export function buildSavePayload(args: {
  householdId: string; cardId: string; dueDate: string; totalCents: Cents;
  source: 'pdf' | 'manual'; pdfPath: string | null; items: ReconciledItem[];
}): SavePayload {
  return {
    household_id: args.householdId, card_id: args.cardId, due_month: monthDate(toMonth(args.dueDate)),
    due_date: args.dueDate, total: fromCents(args.totalCents), source: args.source, pdf_path: args.pdfPath,
    items: args.items.map((i) => ({
      date: i.date, description: i.description, amount: fromCents(i.amountCents), category: i.category,
      installment_n: i.installmentN, installment_total: i.installmentTotal, expense_id: i.expenseId,
      plan: i.planAction === null ? null
        : i.planAction.type === 'link' ? { link: i.planAction.planId }
        : { create: { first_due_month: monthDate(i.planAction.firstDueMonth) } },
    })),
  };
}

/** Message for a failed /api/parse-invoice call; the body may not be JSON (e.g. a platform 413). */
export function parseErrorMessage(status: number, bodyText: string): string {
  try {
    const body = JSON.parse(bodyText) as { error?: unknown };
    if (typeof body.error === 'string' && body.error) return body.error;
  } catch {
    // Not JSON: fall through to the status-based message.
  }
  return status === 413 ? PDF_TOO_LARGE : READ_FAILED;
}

/** Badge of a reviewed row: what saving it will do with installment plans / fixed expenses. */
export function reviewBadge(i: ReconciledItem, expenses: { id: string; name: string }[]): string | null {
  if (i.planAction?.type === 'link') return 'Parcela de compra existente';
  if (i.planAction?.type === 'create') return `Nova compra parcelada (${i.installmentTotal} parcelas)`;
  const exp = i.expenseId ? expenses.find((e) => e.id === i.expenseId) : undefined;
  return exp ? `Conta fixa: ${exp.name}` : null;
}
