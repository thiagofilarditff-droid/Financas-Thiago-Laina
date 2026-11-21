import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import type { DashboardBill } from '../../domain/dashboard';
import BillsList from './BillsList';

const bill = (b: Partial<DashboardBill>): DashboardBill => ({
  key: 'expense:x', kind: 'expense', refId: 'x', invoiceId: null, label: 'X', sublabel: 'Moradia',
  cents: 100000, paid: false, dueDay: 10, canToggle: true, ...b,
});

const bills = [
  bill({ key: 'expense:pnr', refId: 'pnr', label: 'PNR', cents: 66594, paid: true, dueDay: 5, canToggle: false }),
  bill({ key: 'expense:condo', refId: 'condo', label: 'Condomínio SQS 214' }),
  bill({ key: 'card:c1', kind: 'card', refId: 'c1', label: 'Nubank', sublabel: 'Fatura · vence dia 10', cents: 15000, canToggle: false }),
];

test('shows title, paid count and bill details', () => {
  render(<BillsList bills={bills} month="2026-11" onToggle={() => {}} />);
  expect(screen.getByRole('heading', { name: /Contas de novembro/ })).toBeInTheDocument();
  expect(screen.getByText('1/3 pagas')).toBeInTheDocument();
  expect(screen.getByText('Moradia · descontado em folha')).toBeInTheDocument();
  expect(screen.getByText('Moradia · vence dia 10')).toBeInTheDocument();
  expect(screen.getByText('Fatura · vence dia 10')).toBeInTheDocument();
  expect(screen.getByText('1.000,00')).toBeInTheDocument();
});

test('checking a bill calls onToggle with the new paid state', async () => {
  const onToggle = vi.fn();
  render(<BillsList bills={bills} month="2026-11" onToggle={onToggle} />);
  await userEvent.click(screen.getByRole('checkbox', { name: 'Condomínio SQS 214' }));
  expect(onToggle).toHaveBeenCalledWith(bills[1], true);
});

test('payroll-deducted and not-yet-issued card bills are not toggleable', () => {
  render(<BillsList bills={bills} month="2026-11" onToggle={() => {}} />);
  expect(screen.getByRole('checkbox', { name: 'PNR' })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: 'PNR' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Nubank' })).toBeDisabled();
});

test('empty state', () => {
  render(<BillsList bills={[]} month="2026-11" onToggle={() => {}} />);
  expect(screen.getByText('Nenhuma conta neste mês.')).toBeInTheDocument();
});
