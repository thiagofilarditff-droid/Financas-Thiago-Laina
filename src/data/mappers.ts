// DB row <-> domain conversions. The only place where numeric(12,2) <-> Cents
// and date (day 1) <-> Month conversions happen.
import type {
  Card, Cents, Expense, ExpenseEntry, Income, InstallmentPlan, Invoice, InvoiceItem,
  Month, Payslip, PayslipLine, Person,
} from '../domain/types';
import { fromCents, toCents } from '../domain/money';
import { toMonth } from '../domain/month';

/** PostgREST returns numeric as number (or string for large values). */
export type Numeric = number | string;

export const numToCents = (n: Numeric): Cents => toCents(Number(n));
const optCents = (n: Numeric | null): Cents | null => (n === null ? null : numToCents(n));
const optNum = (c: Cents | null): number | null => (c === null ? null : fromCents(c));
export const monthToDate = (m: Month): string => `${m}-01`;
const optMonth = (d: string | null): Month | null => (d === null ? null : toMonth(d));
const optDate = (m: Month | null): string | null => (m === null ? null : monthToDate(m));

export interface PersonRow { id: string; household_id: string; name: string }
export interface PayslipRow { id: string; household_id: string; person_id: string; valid_from: string }
export interface PayslipLineRow {
  id?: string; household_id: string; payslip_id: string; kind: PayslipLine['kind'];
  label: string; amount: Numeric; sort_order: number;
}
export interface IncomeRow {
  id: string; household_id: string; name: string; person_id: string | null; gross: Numeric | null;
  discount: Numeric | null; discount_label: string | null; default_amount: Numeric;
  start_month: string; end_month: string | null;
}
export interface IncomeOverrideRow { id?: string; household_id: string; income_id: string; month: string; amount: Numeric }
export interface ExpenseRow {
  id: string; household_id: string; name: string; category: string; is_fixed: boolean;
  default_amount: Numeric; due_day: number | null; payroll_deducted: boolean; person_id: string | null;
  payment_method: Expense['paymentMethod']; card_id: string | null; start_month: string;
  end_month: string | null; notes: string | null;
}
export interface ExpenseEntryRow {
  id?: string; household_id: string; expense_id: string; month: string; amount: Numeric;
  paid: boolean; paid_at: string | null; paid_by?: string | null;
}
export interface CardRow {
  id: string; household_id: string; name: string; bank: string; brand: string; last4: string | null;
  holder_person_id: string | null; limit_amount: Numeric; closing_day: number; due_day: number;
  color: string; archived: boolean;
}
export interface InvoiceRow {
  id: string; household_id: string; card_id: string; due_month: string; due_date: string; total: Numeric;
  paid: boolean; paid_at: string | null; pdf_path: string | null; source: Invoice['source'];
}
export interface InvoiceItemRow {
  id: string; household_id: string; invoice_id: string; date: string | null; description: string;
  amount: Numeric; category: string; installment_n: number | null; installment_total: number | null;
  plan_id: string | null; expense_id: string | null; source: 'imported' | 'manual';
}
export interface InstallmentPlanRow {
  id: string; household_id: string; card_id: string; description: string; installment_amount: Numeric;
  total_installments: number; first_due_month: string; purchase_date: string | null;
}
export interface CategoryRow { id: string; household_id: string; name: string }

export const rowToPerson = (r: PersonRow): Person => ({ id: r.id, name: r.name });
export const personToRow = (p: Person, householdId: string): PersonRow =>
  ({ id: p.id, household_id: householdId, name: p.name });

export const rowToPayslipLine = (r: PayslipLineRow): PayslipLine =>
  ({ kind: r.kind, label: r.label, amountCents: numToCents(r.amount), order: r.sort_order });
export const payslipLineToRow = (l: PayslipLine, payslipId: string, householdId: string): PayslipLineRow => ({
  household_id: householdId, payslip_id: payslipId, kind: l.kind, label: l.label,
  amount: fromCents(l.amountCents), sort_order: l.order,
});

/** Builds a payslip from its row and the household's lines (only its own lines are kept). */
export const rowToPayslip = (r: PayslipRow, lines: PayslipLineRow[]): Payslip => ({
  id: r.id, personId: r.person_id, validFrom: toMonth(r.valid_from),
  lines: lines.filter((l) => l.payslip_id === r.id).sort((a, b) => a.sort_order - b.sort_order).map(rowToPayslipLine),
});
export const payslipToRow = (p: Payslip, householdId: string): PayslipRow =>
  ({ id: p.id, household_id: householdId, person_id: p.personId, valid_from: monthToDate(p.validFrom) });

/** Builds an income from its row and the household's overrides (only its own are kept). */
export const rowToIncome = (r: IncomeRow, overrides: IncomeOverrideRow[]): Income => ({
  id: r.id, name: r.name, personId: r.person_id, grossCents: optCents(r.gross),
  discountCents: optCents(r.discount), discountLabel: r.discount_label, defaultCents: numToCents(r.default_amount),
  startMonth: toMonth(r.start_month), endMonth: optMonth(r.end_month),
  overrides: Object.fromEntries(
    overrides.filter((o) => o.income_id === r.id).map((o) => [toMonth(o.month), numToCents(o.amount)]),
  ),
});
export const incomeToRow = (i: Income, householdId: string): IncomeRow => ({
  id: i.id, household_id: householdId, name: i.name, person_id: i.personId, gross: optNum(i.grossCents),
  discount: optNum(i.discountCents), discount_label: i.discountLabel, default_amount: fromCents(i.defaultCents),
  start_month: monthToDate(i.startMonth), end_month: optDate(i.endMonth),
});
export const incomeOverrideToRow = (incomeId: string, month: Month, cents: Cents, householdId: string): IncomeOverrideRow =>
  ({ household_id: householdId, income_id: incomeId, month: monthToDate(month), amount: fromCents(cents) });

export const rowToExpense = (r: ExpenseRow): Expense => ({
  id: r.id, name: r.name, category: r.category, isFixed: r.is_fixed, defaultCents: numToCents(r.default_amount),
  dueDay: r.due_day, payrollDeducted: r.payroll_deducted, personId: r.person_id, paymentMethod: r.payment_method,
  cardId: r.card_id, startMonth: toMonth(r.start_month), endMonth: optMonth(r.end_month), notes: r.notes,
});
export const expenseToRow = (e: Expense, householdId: string): ExpenseRow => ({
  id: e.id, household_id: householdId, name: e.name, category: e.category, is_fixed: e.isFixed,
  default_amount: fromCents(e.defaultCents), due_day: e.dueDay, payroll_deducted: e.payrollDeducted,
  person_id: e.personId, payment_method: e.paymentMethod, card_id: e.cardId,
  start_month: monthToDate(e.startMonth), end_month: optDate(e.endMonth), notes: e.notes,
});

export const rowToEntry = (r: ExpenseEntryRow): ExpenseEntry => ({
  expenseId: r.expense_id, month: toMonth(r.month), amountCents: numToCents(r.amount), paid: r.paid, paidAt: r.paid_at,
});
/** Row for an upsert on (expense_id, month); the id stays with the database. */
export const entryToRow = (e: ExpenseEntry, householdId: string): ExpenseEntryRow => ({
  household_id: householdId, expense_id: e.expenseId, month: monthToDate(e.month),
  amount: fromCents(e.amountCents), paid: e.paid, paid_at: e.paidAt,
});

export const rowToCard = (r: CardRow): Card => ({
  id: r.id, name: r.name, bank: r.bank, brand: r.brand, last4: r.last4 === null ? null : r.last4.trim(),
  holderPersonId: r.holder_person_id, limitCents: numToCents(r.limit_amount), closingDay: r.closing_day,
  dueDay: r.due_day, color: r.color, archived: r.archived,
});
export const cardToRow = (c: Card, householdId: string): CardRow => ({
  id: c.id, household_id: householdId, name: c.name, bank: c.bank, brand: c.brand, last4: c.last4,
  holder_person_id: c.holderPersonId, limit_amount: fromCents(c.limitCents), closing_day: c.closingDay,
  due_day: c.dueDay, color: c.color, archived: c.archived,
});

export const rowToInvoice = (r: InvoiceRow): Invoice => ({
  id: r.id, cardId: r.card_id, dueMonth: toMonth(r.due_month), dueDate: r.due_date, totalCents: numToCents(r.total),
  paid: r.paid, paidAt: r.paid_at, pdfPath: r.pdf_path, source: r.source,
});
export const invoiceToRow = (i: Invoice, householdId: string): InvoiceRow => ({
  id: i.id, household_id: householdId, card_id: i.cardId, due_month: monthToDate(i.dueMonth), due_date: i.dueDate,
  total: fromCents(i.totalCents), paid: i.paid, paid_at: i.paidAt, pdf_path: i.pdfPath, source: i.source,
});

export const rowToInvoiceItem = (r: InvoiceItemRow): InvoiceItem => ({
  id: r.id, invoiceId: r.invoice_id, date: r.date, description: r.description, amountCents: numToCents(r.amount),
  category: r.category, installmentN: r.installment_n, installmentTotal: r.installment_total,
  planId: r.plan_id, expenseId: r.expense_id,
});
export const invoiceItemToRow = (i: InvoiceItem, householdId: string, source: InvoiceItemRow['source']): InvoiceItemRow => ({
  id: i.id, household_id: householdId, invoice_id: i.invoiceId, date: i.date, description: i.description,
  amount: fromCents(i.amountCents), category: i.category, installment_n: i.installmentN,
  installment_total: i.installmentTotal, plan_id: i.planId, expense_id: i.expenseId, source,
});

export const rowToPlan = (r: InstallmentPlanRow): InstallmentPlan => ({
  id: r.id, cardId: r.card_id, description: r.description, installmentCents: numToCents(r.installment_amount),
  totalInstallments: r.total_installments, firstDueMonth: toMonth(r.first_due_month), purchaseDate: r.purchase_date,
});
export const planToRow = (p: InstallmentPlan, householdId: string): InstallmentPlanRow => ({
  id: p.id, household_id: householdId, card_id: p.cardId, description: p.description,
  installment_amount: fromCents(p.installmentCents), total_installments: p.totalInstallments,
  first_due_month: monthToDate(p.firstDueMonth), purchase_date: p.purchaseDate,
});
