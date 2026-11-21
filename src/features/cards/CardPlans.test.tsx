import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InstallmentPlan, Snapshot } from '../../domain/types';
import { nubankCard, seedSnapshot, tvPlan } from '../../domain/fixtures';
import CardPlans from './CardPlans';

const deletePlan = vi.fn(async (_id: string) => {});
vi.mock('../../data/mutations', async () => {
  const { useMutation } = await import('@tanstack/react-query');
  return {
    deletePlan: (id: string) => deletePlan(id),
    useWrite: (fn: (x: unknown) => Promise<unknown>) => useMutation({ mutationFn: fn }),
  };
});

const finished: InstallmentPlan = { ...tvPlan, id: 'plan-old', description: 'SAPATO', totalInstallments: 2, firstDueMonth: '2026-01' };
const other: InstallmentPlan = { ...tvPlan, id: 'plan-c2', cardId: 'c2', description: 'OUTRO CARTAO' };
const snapshot: Snapshot = { ...seedSnapshot, cards: [nubankCard], plans: [tvPlan, finished, other] };

function setup() {
  render(<QueryClientProvider client={new QueryClient()}>
    <CardPlans card={nubankCard} snapshot={snapshot} today="2027-01" /></QueryClientProvider>);
  return userEvent.setup();
}

afterEach(() => deletePlan.mockClear());

test('lists the card\'s ongoing installment purchases with amount and installments left', () => {
  setup();
  const row = screen.getByText('MAGAZINE LUIZA').closest('li')!;
  // 10× 150,00 from Nov/2026 to Ago/2027; from Jan/2027 on, 3/10 to 10/10 are still to come.
  expect(row).toHaveTextContent('10× R$ 150,00');
  expect(row).toHaveTextContent('Nov/2026 a Ago/2027');
  expect(row).toHaveTextContent('faltam 8 de 10');
  expect(screen.queryByText('SAPATO')).not.toBeInTheDocument();
  expect(screen.queryByText('OUTRO CARTAO')).not.toBeInTheDocument();
});

test('"Excluir" asks for confirmation before deleting the plan', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Excluir' }));
  expect(deletePlan).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Confirmar exclusão?' }));
  expect(deletePlan).toHaveBeenCalledWith('plan-tv');
});
