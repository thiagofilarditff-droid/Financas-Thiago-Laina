import { fetchAllPages } from './snapshot';

vi.mock('./supabase', () => ({ supabase: {} }));

test('fetchAllPages keeps requesting until a short page (1000 + 3 = 1003)', async () => {
  const total = Array.from({ length: 1003 }, (_, i) => i);
  const calls: [number, number][] = [];
  const rows = await fetchAllPages<number>(async (from, to) => {
    calls.push([from, to]);
    return { data: total.slice(from, to + 1), error: null };
  });
  expect(rows).toHaveLength(1003);
  expect(rows.at(-1)).toBe(1002);
  expect(calls).toEqual([[0, 999], [1000, 1999]]);
});

test('fetchAllPages makes one extra request when the last page is exactly full', async () => {
  let n = 0;
  const rows = await fetchAllPages<number>(async (from) => {
    n++;
    return { data: from < 4 ? [from, from + 1] : [], error: null };
  }, 2);
  expect(rows).toEqual([0, 1, 2, 3]);
  expect(n).toBe(3);
});

test('fetchAllPages throws the PostgREST error', async () => {
  await expect(fetchAllPages(async () => ({ data: null, error: { message: 'boom' } }))).rejects.toThrow('boom');
});
