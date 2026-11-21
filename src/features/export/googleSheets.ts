// Talks only to sheets.googleapis.com, with the user's own OAuth access token.
type Cell = string | number;
export interface SheetValues { monthly: Cell[][]; invoices: Cell[][] }
export interface ExportResult { spreadsheetId: string; url: string }

export const MONTHLY_SHEET = 'Mês a mês';
export const INVOICES_SHEET = 'Faturas';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';

class ApiError extends Error {
  constructor(readonly status: number) { super(`Google Sheets API: HTTP ${status}`); }
}

async function call(url: string, token: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status);
  return res.json();
}

const sheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

async function create(year: number, token: string): Promise<ExportResult> {
  const r = await call(API, token, {
    properties: { title: `Orçamento Thiago & Laina ${year}` },
    sheets: [{ properties: { title: MONTHLY_SHEET } }, { properties: { title: INVOICES_SHEET } }],
  });
  return { spreadsheetId: r.spreadsheetId, url: r.spreadsheetUrl ?? sheetUrl(r.spreadsheetId) };
}

/** Writes the year to the existing spreadsheet (cleared first), or to a new one when it is missing or inaccessible. */
export async function exportYear(
  year: number, values: SheetValues, accessToken: string, existing?: { spreadsheetId: string },
): Promise<ExportResult> {
  let target: ExportResult | null = null;
  if (existing) {
    try {
      await call(`${API}/${encodeURIComponent(existing.spreadsheetId)}/values:batchClear`, accessToken, { ranges: [`'${MONTHLY_SHEET}'`, `'${INVOICES_SHEET}'`] });
      target = { spreadsheetId: existing.spreadsheetId, url: sheetUrl(existing.spreadsheetId) };
    } catch (e) {
      if (!(e instanceof ApiError && (e.status === 403 || e.status === 404))) throw e;
    }
  }
  target ??= await create(year, accessToken);
  await call(`${API}/${encodeURIComponent(target.spreadsheetId)}/values:batchUpdate`, accessToken, {
    valueInputOption: 'RAW',
    data: [
      { range: `'${MONTHLY_SHEET}'!A1`, values: values.monthly },
      { range: `'${INVOICES_SHEET}'!A1`, values: values.invoices },
    ],
  });
  return target;
}
