import type { Cents, Month, Payslip } from './types';
import { compareMonth } from './month';

export function payslipFor(payslips: Payslip[], personId: string, m: Month): Payslip | null {
  let best: Payslip | null = null;
  for (const p of payslips) {
    if (p.personId !== personId || compareMonth(p.validFrom, m) > 0) continue;
    if (!best || compareMonth(p.validFrom, best.validFrom) > 0) best = p;
  }
  return best;
}

export function payslipTotals(p: Payslip): { proventosCents: Cents; descontosCents: Cents; liquidoCents: Cents } {
  let proventosCents = 0;
  let descontosCents = 0;
  for (const l of p.lines) {
    if (l.kind === 'provento') proventosCents += l.amountCents;
    else descontosCents += l.amountCents;
  }
  return { proventosCents, descontosCents, liquidoCents: proventosCents - descontosCents };
}

export function depositedCents(liquidoCents: Cents, payrollDeductionsCents: Cents[]): Cents {
  return payrollDeductionsCents.reduce((acc, c) => acc - c, liquidoCents);
}
