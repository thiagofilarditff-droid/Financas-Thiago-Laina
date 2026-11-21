import { describe, it, expect, vi, afterEach } from 'vitest';
import { exportYear } from './googleSheets';

const values = { monthly: [['Item', 'JAN']], invoices: [['Vencimento']] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

function stub(responses: Response[]) {
  const fetchMock = vi.fn(async () => responses.shift()!);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const urls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => String(c[0]));

describe('exportYear', () => {
  it('creates a spreadsheet then writes both sheets', async () => {
    const f = stub([json({ spreadsheetId: 'new1', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/new1/edit' }), json({})]);
    const r = await exportYear(2026, values, 'tok');
    expect(r).toEqual({ spreadsheetId: 'new1', url: 'https://docs.google.com/spreadsheets/d/new1/edit' });
    expect(urls(f)).toEqual([
      'https://sheets.googleapis.com/v4/spreadsheets',
      'https://sheets.googleapis.com/v4/spreadsheets/new1/values:batchUpdate',
    ]);
    const create = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(create.properties.title).toBe('Orçamento Thiago & Laina 2026');
    expect(create.sheets.map((s: { properties: { title: string } }) => s.properties.title)).toEqual(['Mês a mês', 'Faturas']);
    const write = JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(write.valueInputOption).toBe('RAW');
    expect(write.data).toHaveLength(2);
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('clears and rewrites an existing spreadsheet', async () => {
    const f = stub([json({}), json({})]);
    const r = await exportYear(2026, values, 'tok', { spreadsheetId: 'abc' });
    expect(r.spreadsheetId).toBe('abc');
    expect(r.url).toBe('https://docs.google.com/spreadsheets/d/abc/edit');
    const clear = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(clear.ranges).toEqual(["'Mês a mês'", "'Faturas'"]);
    expect(urls(f)).toEqual([
      'https://sheets.googleapis.com/v4/spreadsheets/abc/values:batchClear',
      'https://sheets.googleapis.com/v4/spreadsheets/abc/values:batchUpdate',
    ]);
  });

  it.each([403, 404])('creates a new spreadsheet when the existing one answers %i', async (status) => {
    const f = stub([json({}, status), json({ spreadsheetId: 'new2', spreadsheetUrl: 'u2' }), json({})]);
    const r = await exportYear(2026, values, 'tok', { spreadsheetId: 'gone' });
    expect(r).toEqual({ spreadsheetId: 'new2', url: 'u2' });
    expect(urls(f)[1]).toBe('https://sheets.googleapis.com/v4/spreadsheets');
  });

  it('throws on other API errors', async () => {
    stub([json({}, 500)]);
    await expect(exportYear(2026, values, 'tok', { spreadsheetId: 'abc' })).rejects.toThrow();
  });
});
