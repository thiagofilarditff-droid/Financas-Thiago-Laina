import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Snapshot } from '../domain/types';
import { supabase } from './supabase';
import { useHouseholdId } from './auth';
import {
  rowToCard, rowToEntry, rowToExpense, rowToIncome, rowToInvoice, rowToInvoiceItem, rowToPayslip,
  rowToPerson, rowToPlan,
  type CardRow, type CategoryRow, type ExpenseEntryRow, type ExpenseRow, type IncomeOverrideRow, type IncomeRow,
  type InstallmentPlanRow, type InvoiceItemRow, type InvoiceRow, type PayslipLineRow, type PayslipRow, type PersonRow,
} from './mappers';

export const SNAPSHOT_KEY = ['snapshot'] as const;

/** PostgREST caps every response at max_rows (1000 by default). */
export const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Requests pages [from, to] until a short page arrives, so no table is silently truncated. */
export async function fetchAllPages<T>(page: (from: number, to: number) => Page<T>, pageSize = PAGE_SIZE): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

/** Loads every row of the household in parallel and assembles the domain snapshot. */
export async function fetchSnapshot(householdId: string, client: SupabaseClient = supabase): Promise<Snapshot> {
  async function all<T>(table: string, orderBy: string): Promise<T[]> {
    try {
      // Ordered by a unique tail (id) so pages are stable.
      return await fetchAllPages<T>((from, to) =>
        client.from(table).select('*').eq('household_id', householdId)
          .order(orderBy).order('id').range(from, to) as unknown as Page<T>);
    } catch (e) {
      throw new Error(`Falha ao carregar ${table}: ${(e as Error).message}`);
    }
  }

  const [people, payslips, lines, incomes, overrides, expenses, entries, cards, invoices, items, plans, categories] =
    await Promise.all([
      all<PersonRow>('people', 'name'),
      all<PayslipRow>('payslips', 'valid_from'),
      all<PayslipLineRow>('payslip_lines', 'sort_order'),
      all<IncomeRow>('incomes', 'name'),
      all<IncomeOverrideRow>('income_overrides', 'month'),
      all<ExpenseRow>('expenses', 'name'),
      all<ExpenseEntryRow>('expense_entries', 'month'),
      all<CardRow>('cards', 'name'),
      all<InvoiceRow>('invoices', 'due_month'),
      all<InvoiceItemRow>('invoice_items', 'date'),
      all<InstallmentPlanRow>('installment_plans', 'first_due_month'),
      all<CategoryRow>('categories', 'name'),
    ]);

  return {
    people: people.map(rowToPerson),
    payslips: payslips.map((p) => rowToPayslip(p, lines)),
    incomes: incomes.map((i) => rowToIncome(i, overrides)),
    expenses: expenses.map(rowToExpense),
    entries: entries.map(rowToEntry),
    cards: cards.map(rowToCard),
    invoices: invoices.map(rowToInvoice),
    items: items.map(rowToInvoiceItem),
    plans: plans.map(rowToPlan),
    categories: categories.map((c) => c.name),
  };
}

export function useSnapshot(): UseQueryResult<Snapshot> {
  const householdId = useHouseholdId();
  return useQuery({ queryKey: SNAPSHOT_KEY, queryFn: () => fetchSnapshot(householdId) });
}
