import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import ExpenseForm from './ExpenseForm';

const props = {
  categories: ['Moradia', 'Saúde'],
  cards: [{ id: 'c1', name: 'Nubank' }],
  people: [{ id: 'p-thiago', name: 'Thiago' }, { id: 'p-laina', name: 'Laina' }],
  month: '2026-11' as const,
  initial: null,
  busy: false,
  error: null,
  onCancel: () => {},
  onCreateCategory: async () => {},
};

test('card payment shows a required card select and hides payroll deduction', async () => {
  const user = userEvent.setup();
  render(<ExpenseForm {...props} onSubmit={() => {}} />);
  expect(screen.getByLabelText('Descontada em folha')).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Forma de pagamento'), 'card');
  expect(screen.queryByLabelText('Descontada em folha')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Cartão')).toBeRequired();
});

test('payroll deduction asks for the payslip owner', async () => {
  const user = userEvent.setup();
  render(<ExpenseForm {...props} onSubmit={() => {}} />);
  expect(screen.queryByLabelText('De qual contracheque')).not.toBeInTheDocument();
  await user.click(screen.getByLabelText('Descontada em folha'));
  const sel = screen.getByLabelText('De qual contracheque');
  expect(sel).toHaveTextContent('Thiago');
  expect(sel).toHaveTextContent('Laina');
});

test('submitting parses "1.000,00" into 100000 cents', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<ExpenseForm {...props} onSubmit={onSubmit} />);
  await user.type(screen.getByLabelText('Nome'), 'Aluguel');
  await user.selectOptions(screen.getByLabelText('Categoria'), 'Moradia');
  await user.type(screen.getByLabelText('Valor padrão'), '1.000,00');
  await user.click(screen.getByRole('button', { name: 'Salvar despesa' }));
  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Aluguel', category: 'Moradia', defaultCents: 100000, paymentMethod: 'cash',
    payrollDeducted: false, personId: null, cardId: null, isFixed: true, startMonth: '2026-11',
  }));
});

test('without cards the Cartão option is disabled with a hint', () => {
  render(<ExpenseForm {...props} cards={[]} onSubmit={() => {}} />);
  expect(screen.getByRole('option', { name: 'Cartão' })).toBeDisabled();
  expect(screen.getByText('Cadastre um cartão em Cartões primeiro.')).toBeInTheDocument();
});

