import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Snapshot } from '../../domain/types';
import { nubankCard, seedSnapshot, tvPlan } from '../../domain/fixtures';
import CardInvoices, { replaceWarning } from './CardInvoices';

const deleteInvoice = vi.fn(async (_id: string) => {});
vi.mock('../../data/mutations', async () => {
  const { useMutation } = await import('@tanstack/react-query');
  return {
    deleteInvoice: (id: string) => deleteInvoice(id),
    setInvoicePaid: async () => {},
    useWrite: (fn: (x: unknown) => Promise<unknown>) => useMutation({ mutationFn: fn }),
  };
});

const spotify = {
  id: 'e-spotify', name: 'Spotify', category: 'Streamings', isFixed: true, defaultCents: 2190, dueDay: 10,
  payrollDeducted: false, personId: null, paymentMethod: 'card' as const, cardId: 'c1', startMonth: '2026-01', endMonth: null, notes: null,
};
const snapshot: Snapshot = {
  ...seedSnapshot, cards: [nubankCard], plans: [tvPlan], expenses: [...seedSnapshot.expenses, spotify],
  invoices: [{ id: 'inv-nov', cardId: 'c1', dueMonth: '2026-11', dueDate: '2026-11-10', totalCents: 50000, paid: true,
    paidAt: null, pdfPath: 'h/x.pdf', source: 'pdf' }],
};

function setup() {
  render(<QueryClientProvider client={new QueryClient()}>
    <CardInvoices card={nubankCard} snapshot={snapshot} today="2026-11" /></QueryClientProvider>);
  return userEvent.setup();
}

afterEach(() => deleteInvoice.mockClear());

test('projected months include the fixed expenses paid on the card', () => {
  setup();
  const dez = screen.getByText('Dez/2026').closest('li')!;
  // TV installment 2/10 (150,00) + Spotify (21,90)
  expect(within(dez).getByText('R$ 171,90')).toBeInTheDocument();
  expect(dez).toHaveTextContent('Spotify');
});

test('"Excluir fatura" asks for confirmation before deleting', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Excluir fatura' }));
  expect(deleteInvoice).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('button', { name: 'Confirmar exclusão?' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Excluir fatura' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar exclusão?' }));
  expect(deleteInvoice).toHaveBeenCalledWith('inv-nov');
});

test('the replace warning says when the existing invoice is paid', () => {
  expect(replaceWarning('2026-11', true)).toBe('Já existe uma fatura de Nov/2026 (paga) para este cartão. Salvar vai substituí-la.');
  expect(replaceWarning('2026-11', false)).toBe('Já existe uma fatura de Nov/2026 para este cartão. Salvar vai substituí-la.');
});
