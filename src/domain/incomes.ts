import type { Cents, Income, Month, Snapshot } from './types';
import { compareMonth } from './month';
import { payslipFor, payslipTotals } from './payslip';

export function incomeFor(income: Income, m: Month): Cents | null {
  if (compareMonth(m, income.startMonth) < 0) return null;
  if (income.endMonth && compareMonth(m, income.endMonth) > 0) return null;
  return income.overrides[m] ?? income.defaultCents;
}

export function incomeRowsFor(
  s: Snapshot,
  m: Month,
): { key: string; label: string; personId: string | null; cents: Cents }[] {
  const rows: { key: string; label: string; personId: string | null; cents: Cents }[] = [];
  for (const person of s.people) {
    const slip = payslipFor(s.payslips, person.id, m);
    if (!slip) continue;
    rows.push({
      key: `payslip:${person.id}`,
      label: `Salário Líquido ${person.name}`,
      personId: person.id,
      cents: payslipTotals(slip).liquidoCents,
    });
  }
  for (const inc of s.incomes) {
    const cents = incomeFor(inc, m);
    if (cents === null) continue;
    rows.push({ key: `income:${inc.id}`, label: inc.name, personId: inc.personId, cents });
  }
  return rows;
}
