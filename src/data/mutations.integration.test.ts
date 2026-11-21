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
      await expect(m.savePayslip(hid, thiago.id, '2099-01', [
        { kind: 'provento', label: 'Novo', amountCents: 1, order: 0 },
        { kind: 'x' as 'provento', label: 'Ruim', amountCents: 1, order: 1 },
      ])).rejects.toThrow();
      await expect(m.savePayslip(hid, thiago.id, '2099-03', [{ kind: 'x' as 'provento', label: 'Ruim', amountCents: 1, order: 0 }])).rejects.toThrow();
      let snap = await fetchSnapshot(hid);
      expect(snap.payslips.some((p) => p.validFrom === '2099-03')).toBe(false);
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

  test('expenses: upsert, entries, end, delete guard, categories', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', LOCAL_URL);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', ANON);
    const { supabase } = await import('./supabase');
    const { fetchSnapshot } = await import('./snapshot');
    const m = await import('./mutations');
    const { entryFor, isActiveIn } = await import('../domain/expenses');

    const { data: auth, error } = await supabase.auth.signInWithPassword({ email: 'thiago@local.test', password: 'senha-local-123' });
    expect(error).toBeNull();
    const { data: member } = await supabase.from('household_members').select('household_id').eq('user_id', auth.user!.id).single();
    const hid = member!.household_id as string;
    const base = { category: 'Teste cat', isFixed: true, dueDay: 5, payrollDeducted: false, personId: null,
      paymentMethod: 'cash' as const, cardId: null, startMonth: '2026-01' as const, endMonth: null, notes: null };

    try {
      await m.addCategory(hid, 'Teste cat');
      await m.addCategory(hid, 'Teste cat');
      expect((await fetchSnapshot(hid)).categories.filter((c) => c === 'Teste cat')).toHaveLength(1);

      await m.upsertExpense(hid, { ...base, name: 'Teste desp A', defaultCents: 10000 });
      await m.upsertExpense(hid, { ...base, name: 'Teste desp B', defaultCents: 5000 });
      let snap = await fetchSnapshot(hid);
      const a = snap.expenses.find((e) => e.name === 'Teste desp A')!;
      const b = snap.expenses.find((e) => e.name === 'Teste desp B')!;
      await m.upsertExpense(hid, { ...a, defaultCents: 12000 });
      // card_id requires payment_method = 'card'
      await expect(m.upsertExpense(hid, { ...a, cardId: snap.cards[0]?.id ?? '00000000-0000-0000-0000-000000000000' })).rejects.toThrow();

      await m.setEntry(hid, a.id, '2026-11', { paid: true });
      await m.setEntry(hid, a.id, '2026-11', { amountCents: 13000 });
      snap = await fetchSnapshot(hid);
      const entry = entryFor(snap.expenses.find((e) => e.id === a.id)!, snap.entries, '2026-11')!;
      expect(entry).toMatchObject({ amountCents: 13000, paid: true });
      expect(entry.paidAt).not.toBeNull();
      await m.setEntry(hid, a.id, '2026-11', { paid: false });
      expect((await fetchSnapshot(hid)).entries.find((e) => e.expenseId === a.id && e.month === '2026-11')).toMatchObject({ paid: false, paidAt: null, amountCents: 13000 });

      await expect(m.deleteExpense(a.id)).rejects.toThrow(/lançamentos/);
      await m.endExpense(a.id, '2026-11');
      snap = await fetchSnapshot(hid);
      expect(isActiveIn(snap.expenses.find((e) => e.id === a.id)!, '2026-12')).toBe(false);
      expect(isActiveIn(snap.expenses.find((e) => e.id === a.id)!, '2026-11')).toBe(true);

      await m.deleteExpense(b.id);
      expect((await fetchSnapshot(hid)).expenses.some((e) => e.id === b.id)).toBe(false);
    } finally {
      await supabase.from('expenses').delete().like('name', 'Teste desp%');
      await supabase.from('categories').delete().eq('name', 'Teste cat');
    }
  });

  test('cards: manual and imported invoices replace each other, plans link, PDFs are cleaned up', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', LOCAL_URL);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', ANON);
    const { supabase } = await import('./supabase');
    const { fetchSnapshot } = await import('./snapshot');
    const m = await import('./mutations');
    const { reconcile, cardLimitUsedCents } = await import('../domain/installments');
    const { buildSavePayload } = await import('../features/import/review');

    const { data: auth, error } = await supabase.auth.signInWithPassword({ email: 'thiago@local.test', password: 'senha-local-123' });
    expect(error).toBeNull();
    const { data: member } = await supabase.from('household_members').select('household_id').eq('user_id', auth.user!.id).single();
    const hid = member!.household_id as string;
    const card = { name: 'Teste cartão', bank: 'Nubank', brand: 'Visa', last4: '1234', holderPersonId: null,
      limitCents: 1000000, closingDay: 3, dueDay: 31, color: '#0f7a64', archived: false };
    const pdf = () => new File([new Uint8Array([37, 80, 68, 70])], 'fatura.pdf', { type: 'application/pdf' });
    const items = [
      { date: '2026-09-02', description: 'Loja X 03/10', amountCents: 10000, category: 'Outras', installmentN: 3, installmentTotal: 10 },
      { date: '2026-11-03', description: 'Mercado', amountCents: 15000, category: 'Alimentação', installmentN: null, installmentTotal: null },
    ];

    let cardId = '';
    try {
      await m.upsertCard(hid, card);
      let snap = await fetchSnapshot(hid);
      cardId = snap.cards.find((c) => c.name === 'Teste cartão')!.id;

      await m.saveManualInvoice(hid, cardId, '2027-02', 50000);
      snap = await fetchSnapshot(hid);
      expect(snap.invoices.filter((i) => i.cardId === cardId)).toMatchObject([{ dueDate: '2027-02-28', totalCents: 50000, source: 'manual' }]);

      const importOnce = async () => {
        const s = await fetchSnapshot(hid);
        const rec = reconcile(items, s.plans, s.expenses, cardId, '2027-02');
        return m.importInvoice(buildSavePayload({ householdId: hid, cardId, dueDate: '2027-02-10', totalCents: 26000,
          source: 'pdf', pdfPath: null, items: rec }), pdf());
      };
      await importOnce();
      snap = await fetchSnapshot(hid);
      const firstPdf = snap.invoices.find((i) => i.cardId === cardId)!.pdfPath!;
      const usedAfterFirst = cardLimitUsedCents(snap, cardId, '2026-11');
      await importOnce();
      snap = await fetchSnapshot(hid);
      const invs = snap.invoices.filter((i) => i.cardId === cardId);
      expect(invs).toHaveLength(1);
      expect(invs[0]).toMatchObject({ totalCents: 26000, source: 'pdf' });
      expect(snap.items.filter((i) => i.invoiceId === invs[0].id)).toHaveLength(2);
      expect(snap.plans.filter((p) => p.cardId === cardId)).toHaveLength(1);
      expect(cardLimitUsedCents(snap, cardId, '2026-11')).toBe(usedAfterFirst);
      expect(usedAfterFirst).toBe(26000 + 7 * 10000);
      const listed = (await supabase.storage.from('invoices').list(hid)).data!.map((o) => `${hid}/${o.name}`);
      expect(listed).toContain(invs[0].pdfPath);
      expect(listed).not.toContain(firstPdf);

      await m.setInvoicePaid(invs[0].id, true);
      snap = await fetchSnapshot(hid);
      expect(snap.invoices.find((i) => i.id === invs[0].id)).toMatchObject({ paid: true });
      expect(cardLimitUsedCents(snap, cardId, '2026-11')).toBe(7 * 10000);

      // A failed save removes the uploaded PDF again.
      const before = (await supabase.storage.from('invoices').list(hid)).data!.length;
      await expect(m.importInvoice(buildSavePayload({ householdId: hid, cardId, dueDate: '2027-03-40', totalCents: 1,
        source: 'pdf', pdfPath: null, items: [] }), pdf())).rejects.toThrow();
      expect((await supabase.storage.from('invoices').list(hid)).data!.length).toBe(before);

      await m.createManualPlan(hid, cardId, 'Geladeira', 25000, 4, '2027-04');
      expect((await fetchSnapshot(hid)).plans.filter((p) => p.cardId === cardId)).toHaveLength(2);

      expect(await m.archiveCard(cardId)).toBe('archived');
      expect((await fetchSnapshot(hid)).cards.find((c) => c.id === cardId)!.archived).toBe(true);

      await m.upsertCard(hid, { ...card, name: 'Teste cartão vazio' });
      const empty = (await fetchSnapshot(hid)).cards.find((c) => c.name === 'Teste cartão vazio')!;
      expect(await m.archiveCard(empty.id)).toBe('deleted');
      expect((await fetchSnapshot(hid)).cards.some((c) => c.id === empty.id)).toBe(false);
    } finally {
      if (cardId) {
        const { data: inv } = await supabase.from('invoices').select('pdf_path').eq('card_id', cardId);
        const paths = (inv ?? []).map((i) => i.pdf_path).filter(Boolean) as string[];
        if (paths.length) await supabase.storage.from('invoices').remove(paths);
        await supabase.from('invoices').delete().eq('card_id', cardId);
        await supabase.from('installment_plans').delete().eq('card_id', cardId);
      }
      await supabase.from('cards').delete().like('name', 'Teste cartão%');
    }
  });
  test('re-import with a corrected amount, deleteInvoice and deletePlan leave no orphan plan', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', LOCAL_URL);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', ANON);
    const { supabase } = await import('./supabase');
    const { fetchSnapshot } = await import('./snapshot');
    const m = await import('./mutations');
    const { reconcile } = await import('../domain/installments');
    const { buildSavePayload } = await import('../features/import/review');

    const { data: auth, error } = await supabase.auth.signInWithPassword({ email: 'thiago@local.test', password: 'senha-local-123' });
    expect(error).toBeNull();
    const { data: member } = await supabase.from('household_members').select('household_id').eq('user_id', auth.user!.id).single();
    const hid = member!.household_id as string;
    const pdf = () => new File([new Uint8Array([37, 80, 68, 70])], 'fatura.pdf', { type: 'application/pdf' });
    const importWith = async (cardId: string, amountCents: number) => {
      const s = await fetchSnapshot(hid);
      const items = [{ date: '2026-09-02', description: 'Loja Y 03/10', amountCents, category: 'Outras', installmentN: 3, installmentTotal: 10 }];
      return m.importInvoice(buildSavePayload({ householdId: hid, cardId, dueDate: '2027-02-10', totalCents: amountCents,
        source: 'pdf', pdfPath: null, items: reconcile(items, s.plans, s.expenses, cardId, '2027-02') }), pdf());
    };

    let cardId = '';
    try {
      await m.upsertCard(hid, { name: 'Teste cartão orfão', bank: 'Nubank', brand: '', last4: null, holderPersonId: null,
        limitCents: 0, closingDay: 3, dueDay: 10, color: '#0f7a64', archived: false });
      cardId = (await fetchSnapshot(hid)).cards.find((c) => c.name === 'Teste cartão orfão')!.id;
      await m.createManualPlan(hid, cardId, 'Geladeira', 25000, 4, '2027-04');

      await importWith(cardId, 10000);
      await importWith(cardId, 11000); // corrected amount: a new plan, the first one is left with no items
      let snap = await fetchSnapshot(hid);
      const plans = snap.plans.filter((p) => p.cardId === cardId);
      expect(plans.map((p) => p.installmentCents).sort()).toEqual([11000, 25000]);

      const inv = snap.invoices.find((i) => i.cardId === cardId)!;
      await m.deleteInvoice(inv.id);
      snap = await fetchSnapshot(hid);
      expect(snap.invoices.some((i) => i.id === inv.id)).toBe(false);
      expect(snap.items.some((i) => i.invoiceId === inv.id)).toBe(false);
      expect(snap.plans.filter((p) => p.cardId === cardId).map((p) => p.description)).toEqual(['Geladeira']);
      const listed = (await supabase.storage.from('invoices').list(hid)).data!.map((o) => `${hid}/${o.name}`);
      expect(listed).not.toContain(inv.pdfPath);

      await m.deletePlan(snap.plans.find((p) => p.cardId === cardId)!.id);
      expect((await fetchSnapshot(hid)).plans.some((p) => p.cardId === cardId)).toBe(false);
    } finally {
      if (cardId) {
        const { data: inv } = await supabase.from('invoices').select('pdf_path').eq('card_id', cardId);
        const paths = (inv ?? []).map((i) => i.pdf_path).filter(Boolean) as string[];
        if (paths.length) await supabase.storage.from('invoices').remove(paths);
        await supabase.from('invoices').delete().eq('card_id', cardId);
        await supabase.from('installment_plans').delete().eq('card_id', cardId);
      }
      await supabase.from('cards').delete().eq('name', 'Teste cartão orfão');
    }
  });
  test('editing a default keeps past months: expenses and incomes', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', LOCAL_URL);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', ANON);
    const { supabase } = await import('./supabase');
    const { fetchSnapshot } = await import('./snapshot');
    const m = await import('./mutations');
    const { entryFor } = await import('../domain/expenses');
    const { incomeFor } = await import('../domain/incomes');
    const { addMonths, currentMonth } = await import('../domain/month');

    const { data: auth, error } = await supabase.auth.signInWithPassword({ email: 'thiago@local.test', password: 'senha-local-123' });
    expect(error).toBeNull();
    const { data: member } = await supabase.from('household_members').select('household_id').eq('user_id', auth.user!.id).single();
    const hid = member!.household_id as string;
    const now = currentMonth();
    const start = addMonths(now, -3);
    const last = addMonths(now, -1);

    try {
      await m.upsertExpense(hid, { name: 'Teste hist desp', category: 'Moradia', isFixed: true, defaultCents: 10000, dueDay: 5,
        payrollDeducted: true, personId: null, paymentMethod: 'cash', cardId: null, startMonth: start, endMonth: null, notes: null });
      let snap = await fetchSnapshot(hid);
      const e = snap.expenses.find((x) => x.name === 'Teste hist desp')!;
      await m.upsertExpense(hid, { ...e, defaultCents: 12000, payrollDeducted: false });
      snap = await fetchSnapshot(hid);
      const edited = snap.expenses.find((x) => x.id === e.id)!;
      expect(edited).toMatchObject({ defaultCents: 12000, payrollDeducted: false });
      expect(entryFor(edited, snap.entries, start)).toMatchObject({ amountCents: 10000, paid: true });
      expect(entryFor(edited, snap.entries, last)).toMatchObject({ amountCents: 10000, paid: true });
      expect(entryFor(edited, snap.entries, now)).toMatchObject({ amountCents: 12000, paid: false });
      expect(entryFor(edited, snap.entries, addMonths(now, 2))).toMatchObject({ amountCents: 12000 });

      await m.upsertIncome(hid, { name: 'Teste hist renda', personId: null, grossCents: 200000, discountCents: 60000,
        discountLabel: 'Desconto', defaultCents: 140000, startMonth: start, endMonth: null, overrides: {} });
      const inc = (await fetchSnapshot(hid)).incomes.find((i) => i.name === 'Teste hist renda')!;
      await m.upsertIncome(hid, { ...inc, grossCents: 220000, defaultCents: 160000 });
      const after = (await fetchSnapshot(hid)).incomes.find((i) => i.id === inc.id)!;
      expect(after.grossCents).toBe(220000);
      expect(incomeFor(after, start)).toBe(140000);
      expect(incomeFor(after, last)).toBe(140000);
      expect(incomeFor(after, now)).toBe(160000);
    } finally {
      await supabase.from('expenses').delete().eq('name', 'Teste hist desp');
      await supabase.from('incomes').delete().eq('name', 'Teste hist renda');
    }
  });
});
