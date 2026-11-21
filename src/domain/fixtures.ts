import type { Payslip, Income, Expense, Snapshot, Card, InstallmentPlan } from './types';

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

const fixedCash = (id: string, name: string, category: string, defaultCents: number, dueDay: number, payrollDeducted: boolean, personId: string | null): Expense => ({
  id, name, category, isFixed: true, defaultCents, dueDay, payrollDeducted, personId,
  paymentMethod: 'cash', cardId: null, startMonth: '2026-01', endMonth: null, notes: null,
});

export const seedExpenses: Expense[] = [
  fixedCash('e-internet', 'Internet/claro', 'Moradia', 26084, 10, false, null),
  fixedCash('e-pnr', 'PNR', 'Moradia', 66594, 5, true, null),
  fixedCash('e-condominio', 'Condomínio SQS 214', 'Moradia', 100000, 10, false, null),
  fixedCash('e-energia', 'Conta de energia', 'Moradia', 40000, 15, false, null),
  fixedCash('e-saude-laina', 'Plano de saúde Laina/Valentina', 'Saúde', 258124, 10, true, 'p-laina'),
  fixedCash('e-saude-thiago', 'Plano de saúde Thiago', 'Saúde', 67737, 10, true, 'p-thiago'),
  fixedCash('e-claro-laina', 'Claro celular Laina', 'Telefonia', 10190, 15, false, null),
  fixedCash('e-claro-valentina', 'Claro celular Valentina', 'Telefonia', 3000, 15, false, null),
  fixedCash('e-claro-thiago', 'Claro Thiago', 'Telefonia', 11900, 15, false, null),
  fixedCash('e-taya', 'Taya Advogados', 'Outras', 3700, 10, true, null),
  fixedCash('e-clube', 'Clube da Aeronáutica', 'Outras', 26000, 10, true, null),
];

export const seedSnapshot: Snapshot = {
  people: [{ id: 'p-thiago', name: 'Thiago' }, { id: 'p-laina', name: 'Laina' }],
  payslips: [thiagoPayslip, lainaPayslip],
  incomes: [defesaIncome],
  expenses: seedExpenses, entries: [], cards: [], invoices: [], items: [], plans: [], categories: [],
};

export const nubankCard: Card = {
  id: 'c1', name: 'Nubank', bank: 'Nubank', brand: 'Mastercard', last4: '1234',
  holderPersonId: 'p-thiago', limitCents: 1000000, closingDay: 3, dueDay: 10, color: '#8a6fb0', archived: false,
};

export const tvPlan: InstallmentPlan = {
  id: 'plan-tv', cardId: 'c1', description: 'MAGAZINE LUIZA', installmentCents: 15000,
  totalInstallments: 10, firstDueMonth: '2026-11', purchaseDate: null,
};
