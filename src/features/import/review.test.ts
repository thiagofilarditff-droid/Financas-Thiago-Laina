import {
  adjustmentCents, buildSavePayload, parseErrorMessage, parsedFromRow, parseInstallmentText, rowFromParsed,
  reviewBadge, PDF_TOO_LARGE, READ_FAILED,
} from './review';

test('adjustment line includes refunds', () => {
  expect(adjustmentCents(154137, [{ amountCents: 100000 }, { amountCents: -4990 }, { amountCents: 50000 }])).toBe(9127);
});

test('a row round-trips and validates the installment', () => {
  const item = { date: '2026-11-02', description: 'Loja X', amountCents: -123456, category: 'Outras', installmentN: 2, installmentTotal: 10 };
  expect(rowFromParsed(item)).toEqual({ date: '2026-11-02', description: 'Loja X', amount: '-1.234,56', category: 'Outras', installment: '2/10' });
  expect(parsedFromRow(rowFromParsed(item))).toEqual(item);
  expect(parseInstallmentText('')).toBeNull();
  expect(parseInstallmentText('11/10')).toBe('invalid');
  expect(parsedFromRow({ ...rowFromParsed(item), amount: 'abc' })).toBeNull();
});

test('save payload keeps the reviewed total and maps plan actions', () => {
  const base = { date: null, description: 'D', amountCents: 1000, category: 'Outras', expenseId: null };
  const p = buildSavePayload({
    householdId: 'h', cardId: 'c', dueDate: '2026-12-10', totalCents: 5000, source: 'pdf', pdfPath: 'h/x.pdf',
    items: [
      { ...base, installmentN: 2, installmentTotal: 3, planAction: { type: 'link', planId: 'p1' } },
      { ...base, installmentN: 1, installmentTotal: 3, planAction: { type: 'create', firstDueMonth: '2026-12' } },
      { ...base, installmentN: null, installmentTotal: null, planAction: null, expenseId: 'e1' },
    ],
  });
  expect(p).toMatchObject({ household_id: 'h', card_id: 'c', due_month: '2026-12-01', due_date: '2026-12-10', total: 50, source: 'pdf', pdf_path: 'h/x.pdf' });
  expect(p.items.map((i) => i.plan)).toEqual([{ link: 'p1' }, { create: { first_due_month: '2026-12-01' } }, null]);
  expect(p.items[0]).toMatchObject({ amount: 10, installment_n: 2, installment_total: 3 });
  expect(p.items[2].expense_id).toBe('e1');
});

test('parse errors: JSON message verbatim, non-JSON falls back by status', () => {
  expect(parseErrorMessage(429, JSON.stringify({ error: 'O limite gratuito da IA foi atingido. Aguarde um minuto e tente de novo.' })))
    .toBe('O limite gratuito da IA foi atingido. Aguarde um minuto e tente de novo.');
  expect(parseErrorMessage(413, 'Request Entity Too Large')).toBe(PDF_TOO_LARGE);
  expect(parseErrorMessage(500, '<html>oops</html>')).toBe(READ_FAILED);
});

test('row badges', () => {
  const base = { date: null, description: 'D', amountCents: 1000, category: 'Outras', expenseId: null, installmentN: 1, installmentTotal: 6 };
  const exps = [{ id: 'e1', name: 'Netflix' }];
  expect(reviewBadge({ ...base, planAction: { type: 'link', planId: 'p' } }, exps)).toBe('Parcela de compra existente');
  expect(reviewBadge({ ...base, planAction: { type: 'create', firstDueMonth: '2026-12' } }, exps)).toBe('Nova compra parcelada (6 parcelas)');
  expect(reviewBadge({ ...base, installmentN: null, installmentTotal: null, planAction: null, expenseId: 'e1' }, exps)).toBe('Conta fixa: Netflix');
  expect(reviewBadge({ ...base, installmentN: null, installmentTotal: null, planAction: null }, exps)).toBeNull();
});
