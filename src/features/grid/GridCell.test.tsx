import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import GridCell from './GridCell';

test('pending cell is muted and toggles paid on click', async () => {
  const onTogglePaid = vi.fn();
  render(<GridCell cell={{ cents: 100000, state: 'pending' }} kind="expense" label="Condomínio SQS 214, NOV" onTogglePaid={onTogglePaid} />);
  const btn = screen.getByRole('button', { name: 'Condomínio SQS 214, NOV, pendente, 1.000,00' });
  expect(btn).toHaveClass('text-muted');
  await userEvent.click(btn);
  expect(onTogglePaid).toHaveBeenCalledTimes(1);
});

test('paid cell shows check and amount', () => {
  render(<GridCell cell={{ cents: 66594, state: 'paid' }} kind="expense" label="PNR, NOV" onTogglePaid={() => {}} />);
  expect(screen.getByRole('button').textContent).toBe('✓ 665,94');
});

test('payroll-locked paid cell does not toggle', async () => {
  const onTogglePaid = vi.fn();
  render(<GridCell cell={{ cents: 66594, state: 'paid' }} kind="expense" label="PNR, NOV" locked onTogglePaid={onTogglePaid} />);
  expect(screen.getByText('✓ 665,94')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /pago/ })).toBeNull();
  expect(onTogglePaid).not.toHaveBeenCalled();
});

test('projected cell is italic with title Previsto and opens the card', async () => {
  const onOpenCard = vi.fn();
  render(<GridCell cell={{ cents: 50000, state: 'projected' }} kind="card" label="Nubank, NOV" onOpenCard={onOpenCard} />);
  const btn = screen.getByTitle('Previsto');
  expect(btn).toHaveClass('italic');
  await userEvent.click(btn);
  expect(onOpenCard).toHaveBeenCalledTimes(1);
});

test('none cell renders a dash and is not clickable', () => {
  render(<GridCell cell={{ cents: 0, state: 'none' }} kind="expense" label="X, NOV" />);
  expect(screen.getByText('–')).toBeInTheDocument();
  expect(screen.queryByRole('button')).toBeNull();
});

test('income cell is a plain amount, not a button', () => {
  render(<GridCell cell={{ cents: 1183524, state: 'pending' }} kind="income" label="Salário, NOV" />);
  expect(screen.getByText('11.835,24')).toBeInTheDocument();
  expect(screen.queryByRole('button')).toBeNull();
});

test('editar valor opens an input and submits cents', async () => {
  const onEdit = vi.fn();
  render(<GridCell cell={{ cents: 100000, state: 'pending' }} kind="expense" label="Luz, NOV" onTogglePaid={() => {}} onEdit={onEdit} />);
  await userEvent.click(screen.getByRole('button', { name: 'Editar valor de Luz, NOV' }));
  const input = screen.getByLabelText('Novo valor de Luz, NOV');
  await userEvent.clear(input);
  await userEvent.type(input, '1.234,50{Enter}');
  expect(onEdit).toHaveBeenCalledWith(123450);
});
