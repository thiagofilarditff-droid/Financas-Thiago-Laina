import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Snapshot } from '../../domain/types';
import ImportInvoiceDialog from './ImportInvoiceDialog';

const importInvoice = vi.fn(async () => 'inv');
vi.mock('../../data/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } } }));
vi.mock('../../data/auth', () => ({ useHouseholdId: () => 'h1' }));
vi.mock('../../data/mutations', async () => {
  const { useMutation } = await import('@tanstack/react-query');
  return { importInvoice: (...a: unknown[]) => importInvoice(...(a as [])), useWrite: (fn: (x: unknown) => Promise<unknown>) => useMutation({ mutationFn: fn }) };
});

const snapshot: Snapshot = {
  people: [], payslips: [], incomes: [], entries: [], categories: ['Outras', 'Streamings'],
  cards: [
    { id: 'c1', name: 'Nubank', bank: 'Nubank', brand: '', last4: '1234', holderPersonId: null, limitCents: 0, closingDay: 3, dueDay: 10, color: '#0f7a64', archived: false },
    { id: 'c2', name: 'Bradesco', bank: 'Bradesco', brand: '', last4: null, holderPersonId: null, limitCents: 0, closingDay: 3, dueDay: 10, color: '#0f7a64', archived: false },
  ],
  expenses: [{ id: 'e1', name: 'Netflix', category: 'Streamings', isFixed: true, defaultCents: 4490, dueDay: null, payrollDeducted: false,
    personId: null, paymentMethod: 'card', cardId: 'c2', startMonth: '2026-01', endMonth: null, notes: null }],
  invoices: [{ id: 'i0', cardId: 'c2', dueMonth: '2026-12', dueDate: '2026-12-10', totalCents: 100, paid: false, paidAt: null, pdfPath: null, source: 'manual' }],
  items: [],
  plans: [{ id: 'p1', cardId: 'c2', description: 'LOJA X', installmentCents: 10000, totalInstallments: 10, firstDueMonth: '2026-11', purchaseDate: null }],
};

const parsed = {
  detectedBank: 'Bradesco', detectedHolder: null, suggestedCardId: 'c2', dueDate: '2026-12-10', totalCents: 30000, advancePaymentCents: 0,
  items: [
    { date: '2026-10-02', description: 'Loja X 02/10', amountCents: 10000, category: 'Outras', installmentN: 2, installmentTotal: 10 },
    { date: '2026-11-03', description: 'Celular', amountCents: 60000, category: 'Outras', installmentN: 1, installmentTotal: 6 },
    { date: '2026-11-05', description: 'NETFLIX.COM', amountCents: 4490, category: 'Streamings', installmentN: null, installmentTotal: null },
    { date: '2026-11-06', description: 'Estorno', amountCents: -1000, category: 'Outras', installmentN: null, installmentTotal: null },
  ],
};

function setup() {
  render(<QueryClientProvider client={new QueryClient()}><ImportInvoiceDialog snapshot={snapshot} initialCardId="c1" onClose={() => {}} /></QueryClientProvider>);
  return userEvent.setup();
}
const pdf = (size = 10) => new File([new Uint8Array(size)], 'f.pdf', { type: 'application/pdf' });

afterEach(() => { vi.unstubAllGlobals(); importInvoice.mockClear(); });

test('a PDF over 3 MB is refused before any request', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const user = setup();
  await user.upload(screen.getByLabelText(/Arquivo da fatura/), pdf(3 * 1024 * 1024 + 1));
  expect(screen.getByRole('alert')).toHaveTextContent('O PDF passa de 3 MB. Tente exportar a fatura de novo pelo app do banco.');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('a non-JSON 413 shows the 3 MB message with a retry', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Request Entity Too Large', { status: 413 })));
  const user = setup();
  await user.upload(screen.getByLabelText(/Arquivo da fatura/), pdf());
  expect(await screen.findByRole('alert')).toHaveTextContent('O PDF passa de 3 MB.');
  expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
});

test('review: suggested card, badges, adjustment, replace warning; saves the reviewed total', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(parsed), { status: 200 })));
  const user = setup();
  await user.upload(screen.getByLabelText(/Arquivo da fatura/), pdf());
  expect(await screen.findByLabelText('Cartão')).toHaveValue('c2');
  expect(screen.getByText('Parcela de compra existente')).toBeInTheDocument();
  expect(screen.getByText('Nova compra parcelada (6 parcelas)')).toBeInTheDocument();
  expect(screen.getByText('Conta fixa: Netflix')).toBeInTheDocument();
  expect(screen.getByText('Já existe uma fatura de Dez/2026 para este cartão. Salvar vai substituí-la.')).toBeInTheDocument();
  // 300,00 − (100 + 600 + 44,90 − 10) = −434,90
  expect(screen.getByText('Ajuste')).toBeInTheDocument();
  expect(screen.getByText('-434,90')).toBeInTheDocument();

  await user.clear(screen.getByLabelText('Valor do item 2'));
  await user.type(screen.getByLabelText('Valor do item 2'), 'x');
  expect(screen.getByRole('button', { name: 'Salvar fatura' })).toBeDisabled();
  await user.clear(screen.getByLabelText('Valor do item 2'));
  await user.type(screen.getByLabelText('Valor do item 2'), '165,10');
  expect(screen.queryByText('Ajuste')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Salvar fatura' }));
  expect(importInvoice).toHaveBeenCalledTimes(1);
  const [payload, file] = importInvoice.mock.calls[0] as unknown as [{ total: number; card_id: string; items: { plan: unknown }[] }, File];
  expect(payload).toMatchObject({ total: 300, card_id: 'c2', household_id: 'h1' });
  expect(payload.items.map((i) => i.plan)).toEqual([{ link: 'p1' }, { create: { first_due_month: '2026-12-01' } }, null, null]);
  expect(file.name).toBe('f.pdf');
});

test('review: a duplicated row can be removed and a missing item added before saving', async () => {
  const duplicated = { ...parsed, items: [parsed.items[0], parsed.items[0], parsed.items[2]] };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(duplicated), { status: 200 })));
  const user = setup();
  await user.upload(screen.getByLabelText(/Arquivo da fatura/), pdf());
  await screen.findByLabelText('Cartão');
  expect(screen.getAllByLabelText(/^Descrição do item/)).toHaveLength(3);

  await user.click(screen.getByRole('button', { name: 'Remover item 2' }));
  expect(screen.getAllByLabelText(/^Descrição do item/)).toHaveLength(2);
  expect(screen.getByLabelText('Descrição do item 2')).toHaveValue('NETFLIX.COM');

  await user.click(screen.getByRole('button', { name: '+ Adicionar item' }));
  expect(screen.getByLabelText('Descrição do item 3')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Salvar fatura' })).toBeDisabled();
  await user.type(screen.getByLabelText('Descrição do item 3'), 'IOF');
  await user.type(screen.getByLabelText('Valor do item 3'), '5,10');
  await user.selectOptions(screen.getByLabelText('Categoria do item 3'), 'Outras');

  await user.click(screen.getByRole('button', { name: 'Salvar fatura' }));
  const [payload] = importInvoice.mock.calls[0] as unknown as [{ items: { description: string; amount: number; plan: unknown }[] }];
  expect(payload.items.map((i) => [i.description, i.amount, i.plan])).toEqual([
    ['Loja X 02/10', 100, { link: 'p1' }], ['NETFLIX.COM', 44.9, null], ['IOF', 5.1, null],
  ]);
});
