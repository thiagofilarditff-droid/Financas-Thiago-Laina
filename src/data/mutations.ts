// One function per write; feature tasks add theirs here. Every write invalidates the snapshot.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import type { Cents, Income, Month, PayslipLine } from '../domain/types';
import { SNAPSHOT_KEY } from './snapshot';
import { supabase } from './supabase';
import { incomeToRow, monthToDate, payslipLineToRow, incomeOverrideToRow } from './mappers';

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
 * Saves a payslip valid from `validFrom`. If the person already has one for that month its lines
 * are replaced (new lines are inserted before the old ones are removed, so a failure never leaves
 * the payslip empty); otherwise a new payslip is created. Older months keep their old payslip.
 */
export async function savePayslip(
  householdId: string, personId: string, validFrom: Month, lines: PayslipLine[],
): Promise<void> {
  const { data: slip, error } = await supabase.from('payslips')
    .upsert({ household_id: householdId, person_id: personId, valid_from: monthToDate(validFrom) },
      { onConflict: 'person_id,valid_from' })
    .select('id').single();
  check(error);
  const payslipId = (slip as { id: string }).id;
  const { data: old, error: oldError } = await supabase.from('payslip_lines').select('id').eq('payslip_id', payslipId);
  check(oldError);
  const rows = lines.map((l, i) => payslipLineToRow({ ...l, order: i }, payslipId, householdId));
  if (rows.length) check((await supabase.from('payslip_lines').insert(rows)).error);
  const oldIds = ((old ?? []) as { id: string }[]).map((r) => r.id);
  if (oldIds.length) check((await supabase.from('payslip_lines').delete().in('id', oldIds)).error);
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
