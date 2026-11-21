import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { seedSnapshot } from '../../domain/fixtures';
import OtherIncomes from './OtherIncomes';

const upsertIncome = vi.fn(async (..._a: unknown[]) => {});
vi.mock('../../data/auth', () => ({ useHouseholdId: () => 'h1' }));
vi.mock('../../data/mutations', async () => {
  const { useMutation } = await import('@tanstack/react-query');
  const noop = async () => {};
  return {
    upsertIncome: (...a: unknown[]) => upsertIncome(...a), setIncomeOverride: noop, endIncome: noop,
    useWrite: (fn: (x: unknown) => Promise<unknown>) => useMutation({ mutationFn: fn }),
  };
});

async function editDefesa() {
  render(<QueryClientProvider client={new QueryClient()}><OtherIncomes snapshot={seedSnapshot} month="2026-11" /></QueryClientProvider>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Editar' }));
  return user;
}

afterEach(() => upsertIncome.mockClear());

test('editing gross or discount recalculates the net', async () => {
  const user = await editDefesa();
  expect(screen.getByLabelText('Líquido')).toHaveValue('1.400,00');
  await user.clear(screen.getByLabelText('Bruto'));
  await user.type(screen.getByLabelText('Bruto'), '2.200,00');
  expect(screen.getByLabelText('Líquido')).toHaveValue('1.600,00');
  await user.clear(screen.getByLabelText('Desconto'));
  await user.type(screen.getByLabelText('Desconto'), '500,00');
  expect(screen.getByLabelText('Líquido')).toHaveValue('1.700,00');
  await user.click(screen.getByRole('button', { name: 'Salvar receita' }));
  expect(upsertIncome).toHaveBeenCalledWith('h1', expect.objectContaining({ id: 'inc-defesa', grossCents: 220000, discountCents: 50000, defaultCents: 170000 }));
});

test('a net typed after changing the gross is kept', async () => {
  const user = await editDefesa();
  await user.clear(screen.getByLabelText('Bruto'));
  await user.type(screen.getByLabelText('Bruto'), '2.200,00');
  await user.clear(screen.getByLabelText('Líquido'));
  await user.type(screen.getByLabelText('Líquido'), '1.550,00');
  await user.click(screen.getByRole('button', { name: 'Salvar receita' }));
  expect(upsertIncome).toHaveBeenCalledWith('h1', expect.objectContaining({ grossCents: 220000, defaultCents: 155000 }));
});
