import type { Payslip, Income, Snapshot } from './types';

const line = (kind: 'provento' | 'desconto', label: string, amountCents: number, order: number) => ({ kind, label, amountCents, order });

export const thiagoPayslip: Payslip = {
  id: 'ps-thiago', personId: 'p-thiago', validFrom: '2026-01',
  lines: [
    line('provento', 'Soldo Militar da Ativa', 954600, 0),
    line('provento', 'Adicional de Habilitação', 429570, 1),
    line('provento', 'Adicional Militar', 210012, 2),
    line('provento', 'Adicional de Disponibilidade', 114552, 3),
    line('desconto', 'Imposto de Renda (IRRF)', 323580, 4),
    line('desconto', 'Pensão Militar Obrigatória', 179417, 5),
    line('desconto', 'Assistência Médica Hospitalar (FAMHS)', 22213, 6),
  ],
};

export const lainaPayslip: Payslip = {
  id: 'ps-laina', personId: 'p-laina', validFrom: '2026-01',
  lines: [
    line('provento', 'Soldo Militar da Ativa', 1254600, 0),
    line('provento', 'Adicional de Habilitação', 529570, 1),
    line('provento', 'Adicional Militar', 210012, 2),
    line('provento', 'Adicional de Disponibilidade', 114552, 3),
    line('desconto', 'Imposto de Renda (IRRF)', 600000, 4),
    line('desconto', 'Pensão Militar Obrigatória', 179417, 5),
    line('desconto', 'Assistência Médica Hospitalar (FAMHS)', 22213, 6),
  ],
};

export const defesaIncome: Income = {
  id: 'inc-defesa', name: 'Defesa', personId: null, grossCents: 200000,
  discountCents: 60000, discountLabel: 'Desconto', defaultCents: 140000,
  startMonth: '2026-01', endMonth: null, overrides: {},
};

export const seedSnapshot: Snapshot = {
  people: [{ id: 'p-thiago', name: 'Thiago' }, { id: 'p-laina', name: 'Laina' }],
  payslips: [thiagoPayslip, lainaPayslip],
  incomes: [defesaIncome],
  expenses: [], entries: [], cards: [], invoices: [], items: [], plans: [], categories: [],
};
