import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../data/auth';
import { useSnapshot } from '../../data/snapshot';
import { findSheetExport, saveSheetExport } from '../../data/mutations';
import { buildMonthlyGrid } from '../../domain/grid';
import { buildSheetValues } from '../../domain/sheetExport';
import { exportYear } from './googleSheets';

// Minimal typing of the Google Identity Services global loaded in index.html.
interface TokenResponse { access_token?: string; error?: string }
interface TokenClient { requestAccessToken(): void }
declare const google: {
  accounts: { oauth2: { initTokenClient(c: {
    client_id: string; scope: string;
    callback: (r: TokenResponse) => void;
    error_callback: (e: { type: string }) => void;
  }): TokenClient } };
};

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ERROR_MESSAGE = 'Não consegui exportar. Tente de novo.';

/** Resolves to the access token, or null when the user closed the popup. */
function requestToken(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPE,
      callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new Error(r.error ?? 'sem token'))),
      error_callback: (e) => (e.type === 'popup_closed' ? resolve(null) : reject(new Error(e.type))),
    }).requestAccessToken();
  });
}

export default function ExportButton({ year, householdId }: { year: number; householdId: string }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { data: snapshot } = useSnapshot();
  const queryClient = useQueryClient();
  const saved = useQuery({ queryKey: ['sheet-export', userId, year], queryFn: () => findSheetExport(userId, year), enabled: !!userId });
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const link = saved.data?.url;

  async function run() {
    if (!snapshot) return;
    setState('busy');
    try {
      const token = await requestToken();
      if (!token) { setState('idle'); return; }
      const grid = buildMonthlyGrid(snapshot, year);
      const items = snapshot.items.flatMap((item) => {
        const invoice = snapshot.invoices.find((i) => i.id === item.invoiceId);
        const card = invoice && snapshot.cards.find((c) => c.id === invoice.cardId);
        return invoice && card ? [{ dueMonth: invoice.dueMonth, dueDate: invoice.dueDate, cardName: card.name, item }] : [];
      });
      const values = buildSheetValues(grid, items);
      const result = await exportYear(year, values, token, saved.data ?? undefined);
      await saveSheetExport(householdId, userId, year, result.spreadsheetId, result.url);
      await queryClient.invalidateQueries({ queryKey: ['sheet-export', userId, year] });
      setState('done');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={run} disabled={!CLIENT_ID || state === 'busy' || !snapshot}
        title={CLIENT_ID ? undefined : 'Exportação não configurada'}
        className="rounded-inner border border-line bg-card px-3 py-1 text-sm font-semibold disabled:opacity-50">
        {state === 'busy' ? 'Exportando…' : 'Exportar para o Google Drive'}
      </button>
      {state === 'done' && <span role="status" className="text-sm font-semibold text-good">Planilha atualizada</span>}
      {state === 'error' && <span role="alert" className="text-sm font-semibold text-warn">{ERROR_MESSAGE}</span>}
      {link && <a href={link} target="_blank" rel="noreferrer" className="text-sm font-semibold text-accent underline">Abrir planilha</a>}
    </div>
  );
}
