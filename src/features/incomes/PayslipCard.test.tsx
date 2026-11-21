import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import PayslipCard from './PayslipCard';
import { seedSnapshot } from '../../domain/fixtures';
import type { Snapshot } from '../../domain/types';

// PNR (66594) is deducted from Thiago's payroll, next to his health plan (67737).
const snapshot: Snapshot = {
  ...seedSnapshot,
  expenses: seedSnapshot.expenses.map((e) => (e.id === 'e-pnr' ? { ...e, personId: 'p-thiago' } : e)),
};

test('shows payslip totals and the deposited amount for Thiago in 2026-11', () => {
  const { container } = render(<PayslipCard snapshot={snapshot} personId="p-thiago" month="2026-11" onEdit={() => {}} />);
  const text = container.textContent!.replace(/\s+/g, ' ');
  expect(text).toContain('Total proventos R$ 17.087,34');
  expect(text).toContain('Total descontos - R$ 5.252,10');
  expect(text).toContain('Salário líquido R$ 11.835,24');
  expect(text).toContain('Depositado na conta R$ 10.491,93');
  expect(screen.getByTitle('Líquido menos descontos opcionais em folha (PNR, planos, etc.)')).toBeInTheDocument();
});

test('shows an empty state when the person has no payslip yet in that month', () => {
  render(<PayslipCard snapshot={snapshot} personId="p-thiago" month="2025-12" onEdit={() => {}} />);
  expect(screen.getByText(/Nenhum contracheque/)).toBeInTheDocument();
});
