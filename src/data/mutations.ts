// One function per write; feature tasks add theirs here. Every write invalidates the snapshot.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import type { Cents, Income, Month, PayslipLine } from '../domain/types';
import { SNAPSHOT_KEY } from './snapshot';
import { supabase } from './supabase';
import { fromCents } from '../domain/money';
import { incomeToRow, monthToDate, incomeOverrideToRow } from './mappers';

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
