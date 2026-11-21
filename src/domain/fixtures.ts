import type { Payslip, Income, Snapshot } from './types';

const line = (kind: 'provento' | 'desconto', label: string, amountCents: number, order: number) => ({ kind, label, amountCents, order });

export const thiagoPayslip: Payslip = {
  id: 'ps-thiago', personId: 'p-thiago', validFrom: '2026-01',
  lines: [
    line('provento', 'Vencimento básico', 954600, 1),
    line('provento', 'Gratificação', 429570, 2),
    line('provento', 'Auxílio alimentação', 210012, 3),
    line('provento', 'Outros proventos', 114552, 4),
    line('desconto', 'Imposto de renda', 323580, 5),
    line('desconto', 'Previdência', 179417, 6),
    line('desconto', 'Outros descontos', 22213, 7),
  ],
};

export const lainaPayslip: Payslip = {
  id: 'ps-laina', personId: 'p-laina', validFrom: '2026-01',
  lines: [
    line('provento', 'Vencimento básico', 1254600, 1),
    line('provento', 'Gratificação', 529570, 2),
    line('provento', 'Auxílio alimentação', 210012, 3),
    line('provento', 'Outros proventos', 114552, 4),
    line('desconto', 'Imposto de renda', 600000, 5),
    line('desconto', 'Previdência', 179417, 6),
    line('desconto', 'Outros descontos', 22213, 7),
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
