// One function per write; feature tasks add theirs here. Every write invalidates the snapshot.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import type { Card, Cents, Expense, Income, Month, PayslipLine } from '../domain/types';
import { SNAPSHOT_KEY } from './snapshot';
import { supabase } from './supabase';
import { fromCents } from '../domain/money';
import { dueDateFor } from '../domain/month';
import { incomeToRow, monthToDate, incomeOverrideToRow, expenseToRow, cardToRow } from './mappers';
import type { SavePayload } from '../features/import/review';

/** Throws a readable error when a Supabase write failed. */
export function check(error: PostgrestError | null): void {
  if (error) throw new Error(error.message);
}

/** Wraps a write so that, on success, the snapshot is reloaded. */
export function useWrite<TArgs, TResult = void>(write: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY }),
  });
}

/**
 * Saves a payslip valid from `validFrom` through the `save_payslip` Postgres function: one
 * transaction upserts the payslip and replaces its lines, so a failure leaves the previous lines
 * intact. Older months keep their old payslip.
 */
export async function savePayslip(
  householdId: string, personId: string, validFrom: Month, lines: PayslipLine[],
): Promise<void> {
  const p_lines = lines.map((l, i) => ({ kind: l.kind, label: l.label, amount: fromCents(l.amountCents), sort_order: i }));
  check((await supabase.rpc('save_payslip', {
    p_household: householdId, p_person: personId, p_valid_from: monthToDate(validFrom), p_lines,
  })).error);
}

/** Creates (no id) or updates (id) an income. */
export async function upsertIncome(householdId: string, i: Omit<Income, 'id'> & { id?: string }): Promise<void> {
  const { id, ...row } = incomeToRow({ ...i, id: i.id ?? '' }, householdId);
  const table = supabase.from('incomes');
  check((i.id ? await table.update(row).eq('id', i.id) : await table.insert(row)).error);
}

/** Sets (cents) or clears (null) the amount of one income in one month. */
export async function setIncomeOverride(householdId: string, incomeId: string, m: Month, cents: Cents | null): Promise<void> {
  if (cents === null) {
    check((await supabase.from('income_overrides').delete().eq('income_id', incomeId).eq('month', monthToDate(m))).error);
    return;
  }
  check((await supabase.from('income_overrides')
    .upsert(incomeOverrideToRow(incomeId, m, cents, householdId), { onConflict: 'income_id,month' })).error);
}

/** Ends an income after `endMonth` (inclusive); earlier months are unaffected. */
export async function endIncome(incomeId: string, endMonth: Month): Promise<void> {
  check((await supabase.from('incomes').update({ end_month: monthToDate(endMonth) }).eq('id', incomeId)).error);
}

/** Creates (no id) or updates (id) an expense. */
export async function upsertExpense(householdId: string, e: Omit<Expense, 'id'> & { id?: string }): Promise<void> {
  const { id, ...row } = expenseToRow({ ...e, id: e.id ?? '' }, householdId);
  const table = supabase.from('expenses');
  check((e.id ? await table.update(row).eq('id', e.id) : await table.insert(row)).error);
}

/** Ends an expense after `endMonth` (inclusive); history is kept. */
export async function endExpense(expenseId: string, endMonth: Month): Promise<void> {
  check((await supabase.from('expenses').update({ end_month: monthToDate(endMonth) }).eq('id', expenseId)).error);
}

/** Deletes an expense that has no persisted entries; otherwise throws (the UI offers "Encerrar"). */
export async function deleteExpense(expenseId: string): Promise<void> {
  const { count, error } = await supabase.from('expense_entries').select('id', { count: 'exact', head: true }).eq('expense_id', expenseId);
  check(error);
  if (count) throw new Error('Esta despesa já tem lançamentos; encerre-a em vez de excluir.');
  check((await supabase.from('expenses').delete().eq('id', expenseId)).error);
}

/**
 * Upserts the entry of one expense in one month (on `(expense_id, month)`). Missing fields keep the
 * stored entry, or the expense's default amount for a new one. `paid_at` is set when paid becomes true.
 */
export async function setEntry(
  householdId: string, expenseId: string, m: Month, patch: { amountCents?: Cents; paid?: boolean },
): Promise<void> {
  const month = monthToDate(m);
  const { data: existing, error } = await supabase.from('expense_entries')
    .select('amount, paid, paid_at').eq('expense_id', expenseId).eq('month', month).maybeSingle();
  check(error);
  let amount: number | string;
  if (patch.amountCents !== undefined) amount = fromCents(patch.amountCents);
  else if (existing) amount = existing.amount;
  else {
    const { data: exp, error: e2 } = await supabase.from('expenses').select('default_amount').eq('id', expenseId).single();
    check(e2);
    amount = exp!.default_amount;
  }
  const paid = patch.paid ?? existing?.paid ?? false;
  const paid_at = paid ? (existing?.paid && existing.paid_at ? existing.paid_at : new Date().toISOString()) : null;
  check((await supabase.from('expense_entries')
    .upsert({ household_id: householdId, expense_id: expenseId, month, amount, paid, paid_at }, { onConflict: 'expense_id,month' })).error);
}

/** Adds a category to the household (no-op if it already exists). */
export async function addCategory(householdId: string, name: string): Promise<void> {
  check((await supabase.from('categories')
    .upsert({ household_id: householdId, name }, { onConflict: 'household_id,name', ignoreDuplicates: true })).error);
}

/** Creates (no id) or updates (id) a card. */
export async function upsertCard(householdId: string, c: Omit<Card, 'id'> & { id?: string }): Promise<void> {
  const { id, ...row } = cardToRow({ ...c, id: c.id ?? '' }, householdId);
  const table = supabase.from('cards');
  check((c.id ? await table.update(row).eq('id', c.id) : await table.insert(row)).error);
}

/**
 * Removes a card the user no longer uses: deleted when nothing points at it (no invoices, installment
 * plans or expenses); otherwise only archived, so its history is kept.
 */
export async function archiveCard(cardId: string): Promise<'deleted' | 'archived'> {
  for (const table of ['invoices', 'installment_plans', 'expenses']) {
    const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('card_id', cardId);
    check(error);
    if (count) {
      check((await supabase.from('cards').update({ archived: true }).eq('id', cardId)).error);
      return 'archived';
    }
  }
  check((await supabase.from('cards').delete().eq('id', cardId)).error);
  return 'deleted';
}

const BUCKET = 'invoices';

/** Best effort: a leftover PDF object is harmless, so a failed removal is ignored. */
async function removePdf(path: string | null): Promise<void> {
  if (!path) return;
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // ignored
  }
}

async function existingPdfPath(cardId: string, dueMonth: string): Promise<string | null> {
  const { data, error } = await supabase.from('invoices').select('pdf_path')
    .eq('card_id', cardId).eq('due_month', dueMonth).maybeSingle();
  check(error);
  return data?.pdf_path ?? null;
}

/** Saves through `save_imported_invoice` (replacing the card's invoice of that month); removes a replaced PDF. */
async function saveInvoice(payload: SavePayload): Promise<string> {
  const oldPdf = await existingPdfPath(payload.card_id, payload.due_month);
  const { data, error } = await supabase.rpc('save_imported_invoice', { payload });
  check(error);
  if (oldPdf && oldPdf !== payload.pdf_path) await removePdf(oldPdf);
  return data as string;
}

/** Records only the total of a card's invoice for `dueMonth` (no items, no PDF), due on the card's due day. */
export async function saveManualInvoice(householdId: string, cardId: string, dueMonth: Month, totalCents: Cents): Promise<string> {
  const { data: card, error } = await supabase.from('cards').select('due_day').eq('id', cardId).single();
  check(error);
  return saveInvoice({
    household_id: householdId, card_id: cardId, due_month: monthToDate(dueMonth),
    due_date: dueDateFor(dueMonth, card!.due_day as number), total: fromCents(totalCents),
    source: 'manual', pdf_path: null, items: [],
  });
}

/** Marks an invoice paid (paid_at = now) or unpaid. */
export async function setInvoicePaid(invoiceId: string, paid: boolean): Promise<void> {
  check((await supabase.from('invoices')
    .update({ paid, paid_at: paid ? new Date().toISOString() : null }).eq('id', invoiceId)).error);
}

/** Registers an installment purchase by hand; its installments project onto the following invoices. */
export async function createManualPlan(
  householdId: string, cardId: string, description: string, installmentCents: Cents, total: number, firstDueMonth: Month,
): Promise<void> {
  check((await supabase.from('installment_plans').insert({
    household_id: householdId, card_id: cardId, description: description.trim(),
    installment_amount: fromCents(installmentCents), total_installments: total, first_due_month: monthToDate(firstDueMonth),
  })).error);
}

/**
 * Saves a reviewed PDF import: uploads the PDF to `invoices/{household}/{uuid}.pdf`, then saves the
 * invoice. If the save fails the uploaded PDF is removed again.
 */
export async function importInvoice(payload: SavePayload, pdf: File): Promise<string> {
  const path = `${payload.household_id}/${crypto.randomUUID()}.pdf`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf' });
  if (error) throw new Error(error.message);
  try {
    return await saveInvoice({ ...payload, source: 'pdf', pdf_path: path });
  } catch (e) {
    await removePdf(path);
    throw e;
  }
}
