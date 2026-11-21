import { describe, it, expect } from 'vitest';
import { incomeFor, incomeRowsFor } from './incomes';
import { defesaIncome as defesa, seedSnapshot as snap } from './fixtures';

describe('incomeFor', () => {
  it('returns default within range', () => {
    expect(incomeFor(defesa, '2026-05')).toBe(140000);
  });
  it('override wins', () => {
    expect(incomeFor({ ...defesa, overrides: { '2026-05': 150000 } }, '2026-05')).toBe(150000);
  });
  it('is null outside [startMonth, endMonth]', () => {
    expect(incomeFor({ ...defesa, endMonth: '2026-03' }, '2026-04')).toBeNull();
    expect(incomeFor(defesa, '2025-12')).toBeNull();
    expect(incomeFor({ ...defesa, endMonth: '2026-03' }, '2026-03')).toBe(140000);
  });
});

describe('incomeRowsFor', () => {
  it('lists persons then incomes', () => {
    const rows = incomeRowsFor(snap, '2026-11');
    expect(rows.map(r => r.cents)).toEqual([1183524, 1307104, 140000]);
    expect(rows.map(r => r.label)).toEqual(['Salário Líquido Thiago', 'Salário Líquido Laina', 'Defesa']);
    expect(rows.map(r => r.personId)).toEqual(['p-thiago', 'p-laina', null]);
  });
  it('skips inactive incomes and persons without payslip', () => {
    expect(incomeRowsFor(snap, '2025-12')).toEqual([]);
  });
});
