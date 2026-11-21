import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Snapshot } from '../../domain/types';
import { nubankCard, seedSnapshot } from '../../domain/fixtures';
import CardsPage from './CardsPage';

const bradesco = { ...nubankCard, id: 'c2', name: 'Bradesco' };
const snapshot: Snapshot = { ...seedSnapshot, cards: [nubankCard, bradesco] };
vi.mock('../../data/snapshot', () => ({ useSnapshot: () => ({ data: snapshot, isLoading: false, error: null }) }));
vi.mock('../../data/auth', () => ({ useHouseholdId: () => 'h1' }));
vi.mock('../../data/supabase', () => ({ supabase: {} }));
vi.mock('../../data/mutations', async () => {
  const { useMutation } = await import('@tanstack/react-query');
  const noop = async () => {};
  return {
    useWrite: (fn: (x: unknown) => Promise<unknown>) => useMutation({ mutationFn: fn }),
    archiveCard: noop, createManualPlan: noop, saveManualInvoice: noop, upsertCard: noop, deleteInvoice: noop,
    setInvoicePaid: noop, deletePlan: noop, importInvoice: noop,
  };
});

test('?card=<id> scrolls to and highlights that card', () => {
  const scrolled: Element[] = [];
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) { scrolled.push(this); };
  render(<QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={['/cartoes?card=c2']}><CardsPage /></MemoryRouter></QueryClientProvider>);
  const target = screen.getByRole('region', { name: 'Bradesco' });
  expect(target).toHaveAttribute('aria-current', 'true');
  expect(screen.getByRole('region', { name: 'Nubank' })).not.toHaveAttribute('aria-current');
  expect(scrolled).toEqual([target]);
  expect(screen.getAllByRole('heading', { name: 'Compras parceladas' })).toHaveLength(2);
});
