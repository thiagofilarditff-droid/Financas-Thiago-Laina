// @vitest-environment node
// Runs against the local Supabase stack (npm run db:start && npm run db:reset), via `npm run test:integration`.

const LOCAL_URL = 'http://127.0.0.1:54321';
// The local CLI's fixed demo anon key (not a secret).
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

describe.skipIf(!process.env.LOCAL_SUPABASE)('income and payslip writes on the seeded local stack', () => {
  test('savePayslip versions by month, incomes accept overrides and an end month', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', LOCAL_URL);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', ANON);
    const { supabase } = await import('./supabase');
    const { fetchSnapshot } = await import('./snapshot');
    const m = await import('./mutations');
    const { payslipFor, payslipTotals } = await import('../domain/payslip');
    const { incomeFor } = await import('../domain/incomes');

    const { data: auth, error } = await supabase.auth.signInWithPassword({ email: 'thiago@local.test', password: 'senha-local-123' });
    expect(error).toBeNull();
    const { data: member } = await supabase.from('household_members').select('household_id').eq('user_id', auth.user!.id).single();
    const hid = member!.household_id as string;
    const thiago = (await fetchSnapshot(hid)).people.find((p) => p.name === 'Thiago')!;

    try {
      await m.savePayslip(hid, thiago.id, '2099-01', [{ kind: 'provento', label: 'Teste', amountCents: 100000, order: 0 }]);
      await m.savePayslip(hid, thiago.id, '2099-01', [
        { kind: 'provento', label: 'Teste', amountCents: 150000, order: 0 },
        { kind: 'desconto', label: 'Desc', amountCents: 5000, order: 1 },
      ]);
      let snap = await fetchSnapshot(hid);
      expect(snap.payslips.filter((p) => p.personId === thiago.id && p.validFrom === '2099-01')).toHaveLength(1);
      expect(payslipTotals(payslipFor(snap.payslips, thiago.id, '2099-02')!).liquidoCents).toBe(145000);
      expect(payslipTotals(payslipFor(snap.payslips, thiago.id, '2026-11')!).liquidoCents).toBe(1183524);

      await m.upsertIncome(hid, { name: 'Teste renda', personId: null, grossCents: 10000, discountCents: 1000,
        discountLabel: 'Desc', defaultCents: 9000, startMonth: '2026-01', endMonth: null, overrides: {} });
      snap = await fetchSnapshot(hid);
      const inc = snap.incomes.find((i) => i.name === 'Teste renda')!;
      await m.setIncomeOverride(hid, inc.id, '2026-11', 12345);
      await m.setIncomeOverride(hid, inc.id, '2026-11', 12346);
      await m.endIncome(inc.id, '2026-11');
      const after = (await fetchSnapshot(hid)).incomes.find((i) => i.id === inc.id)!;
      expect(incomeFor(after, '2026-11')).toBe(12346);
      expect(incomeFor(after, '2026-12')).toBeNull();
      await m.setIncomeOverride(hid, inc.id, '2026-11', null);
      expect(incomeFor((await fetchSnapshot(hid)).incomes.find((i) => i.id === inc.id)!, '2026-11')).toBe(9000);
    } finally {
      await supabase.from('incomes').delete().eq('name', 'Teste renda');
      await supabase.from('payslips').delete().eq('person_id', thiago.id).eq('valid_from', '2099-01-01');
    }
  });
});
