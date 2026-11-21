import { describe, it, expect } from 'vitest';
import { payslipFor, payslipTotals, depositedCents } from './payslip';
import { thiagoPayslip as thiago, lainaPayslip as laina } from './fixtures';

const thiago2 = { ...thiago, id: 'ps-thiago-2', validFrom: '2026-07' };

describe('payslipTotals', () => {
  it('sums proventos, descontos and liquido', () => {
    expect(payslipTotals(thiago)).toEqual({ proventosCents: 1708734, descontosCents: 525210, liquidoCents: 1183524 });
    expect(payslipTotals(laina)).toEqual({ proventosCents: 2108734, descontosCents: 801630, liquidoCents: 1307104 });
  });
});

describe('payslipFor', () => {
  it('picks the greatest validFrom <= month', () => {
    expect(payslipFor([thiago, thiago2], 'p-thiago', '2026-06')?.id).toBe(thiago.id);
    expect(payslipFor([thiago2, thiago], 'p-thiago', '2026-07')?.id).toBe(thiago2.id);
    expect(payslipFor([thiago, thiago2], 'p-thiago', '2027-01')?.id).toBe(thiago2.id);
  });
  it('returns null before any payslip or for another person', () => {
    expect(payslipFor([thiago], 'p-thiago', '2025-12')).toBeNull();
    expect(payslipFor([thiago], 'p-laina', '2026-06')).toBeNull();
  });
});

describe('depositedCents', () => {
  it('subtracts payroll deductions from liquido', () => {
    expect(depositedCents(1183524, [67737])).toBe(1115787);
    expect(depositedCents(1183524, [])).toBe(1183524);
  });
});
