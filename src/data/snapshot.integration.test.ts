// @vitest-environment node
// Runs against the local Supabase stack (npm run db:start && npm run db:reset), via `npm run test:integration`.
import { createClient } from '@supabase/supabase-js';

const URL = 'http://127.0.0.1:54321';
// The local CLI's fixed demo anon key (not a secret).
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

describe.skipIf(!process.env.LOCAL_SUPABASE)('fetchSnapshot on the seeded local stack', () => {
  test('signed-in member gets the seeded household', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', URL);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', ANON);
    const { fetchSnapshot } = await import('./snapshot');
    const client = createClient(URL, ANON, { auth: { persistSession: false } });

    const { data: auth, error } = await client.auth.signInWithPassword({ email: 'laina@local.test', password: 'senha-local-123' });
    expect(error).toBeNull();
    const { data: member } = await client.from('household_members').select('household_id')
      .eq('user_id', auth.user!.id).single();

    const snap = await fetchSnapshot(member!.household_id, client);
    expect(snap.expenses).toHaveLength(11);
    expect(snap.people.map((p) => p.name)).toEqual(['Laina', 'Thiago']);
    expect(snap.categories).toHaveLength(9);
    expect(snap.payslips.map((p) => p.lines.length)).toEqual([7, 7]);
    expect(snap.incomes[0]).toMatchObject({ defaultCents: 140000, grossCents: 200000, startMonth: '2026-01' });
    expect(snap.expenses.find((e) => e.name === 'Plano de saúde Laina/Valentina')).toMatchObject({
      defaultCents: 258124, payrollDeducted: true, personId: snap.people.find((p) => p.name === 'Laina')!.id,
    });
  });

  test('anonymous visitors see nothing', async () => {
    const anon = createClient(URL, ANON, { auth: { persistSession: false } });
    const { data } = await anon.from('expenses').select('id');
    expect(data).toEqual([]);
  });
});
