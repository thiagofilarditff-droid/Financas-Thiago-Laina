import { describe, expect, test, vi } from 'vitest';
import { parseInvoicePdf, ParseError, normalizeDate } from './parseInvoice';

const cards = [
  { id: 'c1', name: 'Nubank Thiago', bank: 'Nubank', holder: 'Thiago' },
  { id: 'c2', name: 'Bradesco Laina', bank: 'Bradesco', holder: 'Laina' },
];
const b64 = Buffer.from('%PDF-1.4 fake').toString('base64');

const model = (over: Record<string, unknown> = {}, tx?: unknown[]) =>
  JSON.stringify({
    detectedBank: 'Nubank',
    detectedHolder: 'Thiago',
    suggestedCardId: 'c1',
    invoiceDueDate: '2026-11-10',
    totalAmount: 1541.37,
    detectedAdvancePayment: 0,
    transactions: tx ?? [
      { date: '2026-10-03', description: 'MAGAZINE LUIZA', amount: 150, category: 'Outras', installmentInfo: '03/10' },
      { date: '2026-10-05', description: 'ESTORNO LOJA', amount: -49.9, category: 'Outras' },
    ],
    ...over,
  });

const fake = (text: string) => vi.fn(async () => text);

describe('parseInvoicePdf', () => {
  test('maps model JSON to cents', async () => {
    const r = await parseInvoicePdf(b64, cards, fake(model()));
    expect(r.totalCents).toBe(154137);
    expect(r.dueDate).toBe('2026-11-10');
    expect(r.suggestedCardId).toBe('c1');
    expect(r.items[0]).toMatchObject({ amountCents: 15000, installmentN: 3, installmentTotal: 10 });
  });

  test('keeps refunds negative', async () => {
    const r = await parseInvoicePdf(b64, cards, fake(model()));
    expect(r.items[1].amountCents).toBe(-4990);
    expect(r.items[1]).toMatchObject({ installmentN: null, installmentTotal: null });
  });

  test.each([
    ['3/10', 3, 10],
    ['PARC 03/10', 3, 10],
    ['03 DE 10', 3, 10],
    ['00/10', null, null],
    ['11/10', null, null],
    ['abc', null, null],
    ['100/200', null, null],
    ['X103/10', null, null],
    ['', null, null],
  ])('installmentInfo %j', async (info, n, total) => {
    const tx = [{ date: null, description: 'X', amount: 10, category: 'Outras', installmentInfo: info }];
    const r = await parseInvoicePdf(b64, cards, fake(model({}, tx)));
    expect(r.items[0].installmentN).toBe(n);
    expect(r.items[0].installmentTotal).toBe(total);
  });

  test('suggestedCardId must be one of the request cards', async () => {
    const r = await parseInvoicePdf(b64, cards, fake(model({ suggestedCardId: 'zzz' })));
    expect(r.suggestedCardId).toBeNull();
  });

  test('advance payment to cents', async () => {
    const r = await parseInvoicePdf(b64, cards, fake(model({ detectedAdvancePayment: 100.1 })));
    expect(r.advancePaymentCents).toBe(10010);
  });

  test('maps 429 by status', async () => {
    const gen = vi.fn().mockRejectedValue({ status: 429 });
    await expect(parseInvoicePdf(b64, cards, gen)).rejects.toMatchObject({ status: 429 });
  });

  test('maps RESOURCE_EXHAUSTED message to 429', async () => {
    const gen = vi.fn().mockRejectedValue(new Error('RESOURCE_EXHAUSTED: quota'));
    await expect(parseInvoicePdf(b64, cards, gen)).rejects.toMatchObject({ status: 429 });
  });

  test('other generate errors are 502', async () => {
    const gen = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(parseInvoicePdf(b64, cards, gen)).rejects.toMatchObject({ status: 502 });
  });

  test('timeout after 50 s is 504', async () => {
    vi.useFakeTimers();
    try {
      const gen = vi.fn(() => new Promise<string>(() => {}));
      const p = parseInvoicePdf(b64, cards, gen);
      const assertion = expect(p).rejects.toMatchObject({ status: 504 });
      await vi.advanceTimersByTimeAsync(50_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  test('rejects oversized (3 MB + 1 byte) without calling generate', async () => {
    const big = Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64');
    const gen = fake(model());
    await expect(parseInvoicePdf(big, cards, gen)).rejects.toMatchObject({ status: 413 });
    expect(gen).not.toHaveBeenCalled();
  });

  test('accepts exactly 3 MB and strips data: prefix', async () => {
    const ok = 'data:application/pdf;base64,' + Buffer.alloc(3 * 1024 * 1024).toString('base64');
    const gen = fake(model());
    await parseInvoicePdf(ok, cards, gen);
    expect(gen).toHaveBeenCalledOnce();
    const arg = (gen.mock.calls[0] as unknown as [{ pdfBase64: string }])[0];
    expect(arg.pdfBase64.startsWith('data:')).toBe(false);
  });

  test('rejects invalid json', async () => {
    await expect(parseInvoicePdf(b64, cards, fake('not json'))).rejects.toMatchObject({ status: 502 });
  });

  test('rejects JSON failing the schema', async () => {
    await expect(parseInvoicePdf(b64, cards, fake('{"totalAmount":"x"}'))).rejects.toBeInstanceOf(ParseError);
  });
});

describe('normalizeDate', () => {
  test.each([
    ['15/12', '2027-01-10', null, '2026-12-15'],
    ['05/11', '2026-11-10', null, '2026-11-05'],
    ['20/11', '2026-11-10', null, '2025-11-20'],
    ['15/10', '2026-11-10', 12, '2025-10-15'],
    ['15/10/25', '2026-11-10', null, '2025-10-15'],
    ['15/10/2025', '2026-11-10', null, '2025-10-15'],
    ['2026-10-03', undefined, null, '2026-10-03'],
    ['garbage', '2026-11-10', null, null],
    ['2026-13-40', undefined, null, null],
    ['32/01', '2026-11-10', null, null],
  ])('%s due %s n=%s -> %s', (raw, due, n, out) => {
    expect(normalizeDate(raw, due, n)).toBe(out);
  });
});

test('invalid due date is 502', async () => {
  await expect(parseInvoicePdf(b64, cards, fake(model({ invoiceDueDate: '2026-13-45' })))).rejects.toMatchObject({ status: 502 });
});

test('whitespace in base64 is ignored for the size check', async () => {
  const ok = Buffer.alloc(3 * 1024 * 1024).toString('base64').replace(/(.{76})/g, '$1\n');
  const gen = fake(model());
  await parseInvoicePdf(ok, cards, gen);
  expect(gen).toHaveBeenCalledOnce();
});
