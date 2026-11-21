import { useMemo, useState } from 'react';
import type { Snapshot } from '../../domain/types';
import type { ParsedInvoice } from '../../../api/_lib/parseInvoice';
import { reconcile } from '../../domain/installments';
import { formatBRL, parseBRL } from '../../domain/money';
import { toMonth } from '../../domain/month';
import { supabase } from '../../data/supabase';
import { useHouseholdId } from '../../data/auth';
import { importInvoice, useWrite } from '../../data/mutations';
import { replaceWarning } from '../cards/CardInvoices';
import ReviewTable from './ReviewTable';
import {
  buildSavePayload, MAX_PDF_BYTES, parsedFromRow, parseErrorMessage, PDF_TOO_LARGE, READ_FAILED, rowFromParsed,
  type ReviewRow, type SavePayload,
} from './review';

async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Sends the PDF to /api/parse-invoice; throws an Error whose message is shown to the user verbatim. */
async function requestParse(file: File, snapshot: Snapshot): Promise<ParsedInvoice> {
  const { data } = await supabase.auth.getSession();
  const cards = snapshot.cards.filter((c) => !c.archived).map((c) => ({
    id: c.id, name: c.name, bank: c.bank, holder: snapshot.people.find((p) => p.id === c.holderPersonId)?.name ?? '',
  }));
  let res: Response;
  try {
    res = await fetch('/api/parse-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify({ fileBase64: await toBase64(file), cards }),
    });
  } catch {
    throw new Error(READ_FAILED);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(parseErrorMessage(res.status, text));
  try {
    const body = JSON.parse(text) as ParsedInvoice;
    if (!Array.isArray(body.items) || typeof body.totalCents !== 'number') throw new Error('shape');
    return body;
  } catch {
    throw new Error(READ_FAILED);
  }
}

type Stage =
  | { kind: 'pick'; error: string | null }
  | { kind: 'reading'; file: File }
  | { kind: 'failed'; file: File; error: string }
  | { kind: 'review'; file: File; parsed: ParsedInvoice };

interface Props { snapshot: Snapshot; initialCardId: string; onClose(): void }

export default function ImportInvoiceDialog({ snapshot, initialCardId, onClose }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: 'pick', error: null });

  async function read(file: File) {
    if (file.size > MAX_PDF_BYTES) {
      setStage({ kind: 'pick', error: PDF_TOO_LARGE });
      return;
    }
    setStage({ kind: 'reading', file });
    try {
      setStage({ kind: 'review', file, parsed: await requestParse(file, snapshot) });
    } catch (e) {
      setStage({ kind: 'failed', file, error: (e as Error).message });
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-start justify-center overflow-auto bg-fg/40 p-8" role="dialog" aria-modal="true"
      aria-label="Importar fatura (PDF)">
      <div className="w-full max-w-5xl rounded-card border border-line bg-card p-6">
        <h2 className="mb-4 text-xl font-extrabold">Importar fatura (PDF)</h2>
        {stage.kind === 'pick' && (
          <div className="flex flex-col gap-3">
            <label className="text-sm font-semibold">Arquivo da fatura (PDF, até 3 MB)
              <input type="file" accept="application/pdf,.pdf" className="mt-1 block"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); }} /></label>
            {stage.error && <p role="alert" className="text-sm font-semibold text-warn">{stage.error}</p>}
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="rounded-inner border border-line px-4 py-1.5 font-bold">Cancelar</button>
            </div>
          </div>
        )}
        {stage.kind === 'reading' && (
          <div className="flex items-center gap-3 py-8" role="status">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <span className="font-semibold">Lendo a fatura…</span>
          </div>
        )}
        {stage.kind === 'failed' && (
          <div className="flex flex-col gap-3">
            <p role="alert" className="font-semibold text-warn">{stage.error}</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} className="rounded-inner border border-line px-4 py-1.5 font-bold">Cancelar</button>
              <button type="button" onClick={() => setStage({ kind: 'pick', error: null })}
                className="rounded-inner border border-line px-4 py-1.5 font-bold">Escolher outro PDF</button>
              <button type="button" onClick={() => void read(stage.file)}
                className="rounded-inner bg-accent px-4 py-1.5 font-bold text-white">Tentar de novo</button>
            </div>
          </div>
        )}
        {stage.kind === 'review' && (
          <Review snapshot={snapshot} file={stage.file} parsed={stage.parsed} initialCardId={initialCardId} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

const input = 'rounded-inner border border-line bg-card px-2 py-1 outline-none focus:border-accent';

function Review({ snapshot, file, parsed, initialCardId, onClose }:
  { snapshot: Snapshot; file: File; parsed: ParsedInvoice; initialCardId: string; onClose(): void }) {
  const householdId = useHouseholdId();
  const activeCards = snapshot.cards.filter((c) => !c.archived);
  const suggested = activeCards.some((c) => c.id === parsed.suggestedCardId) ? parsed.suggestedCardId! : initialCardId;
  const [cardId, setCardId] = useState(suggested);
  const [dueDate, setDueDate] = useState(parsed.dueDate);
  const [total, setTotal] = useState(formatBRL(parsed.totalCents));
  const [rows, setRows] = useState<ReviewRow[]>(() => parsed.items.map(rowFromParsed));
  const save = useWrite((p: SavePayload) => importInvoice(p, file));

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dueDate);
  const dueMonth = validDate ? toMonth(dueDate) : null;
  const totalCents = parseBRL(total);
  const reconciled = useMemo(() => {
    const items = rows.map(parsedFromRow);
    if (!dueMonth) return items.map(() => null);
    const valid = items.filter((i) => i !== null);
    // All household plans/expenses go in, so existing installment purchases are linked, not duplicated.
    const rec = reconcile(valid, snapshot.plans, snapshot.expenses, cardId, dueMonth);
    let k = 0;
    return items.map((i) => (i === null ? null : rec[k++]));
  }, [rows, dueMonth, cardId, snapshot.plans, snapshot.expenses]);
  const existing = dueMonth ? snapshot.invoices.find((i) => i.cardId === cardId && i.dueMonth === dueMonth) : undefined;
  const invalidRows = reconciled.some((r) => r === null) && dueMonth !== null;
  const problem = !cardId ? 'Escolha o cartão.' : !validDate ? 'Informe o vencimento.'
    : totalCents === null ? 'Informe um total válido (ex.: 1.234,56).' : invalidRows ? 'Corrija os itens destacados.' : null;

  function submit() {
    if (problem || totalCents === null) return;
    save.mutate(buildSavePayload({
      householdId, cardId, dueDate, totalCents, source: 'pdf', pdfPath: null,
      items: reconciled.filter((r) => r !== null),
    }), { onSuccess: onClose });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm font-semibold">Cartão
          <select className={`${input} mt-1 block`} value={cardId} onChange={(e) => setCardId(e.target.value)}>
            <option value="">Selecione…</option>
            {activeCards.map((c) => <option key={c.id} value={c.id}>{c.name}{c.last4 ? ` •••• ${c.last4}` : ''}</option>)}
          </select></label>
        <label className="text-sm font-semibold">Vencimento
          <input type="date" className={`${input} mt-1 block`} value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
        <label className="text-sm font-semibold">Total da fatura
          <input className={`${input} mt-1 block text-right`} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></label>
        <p className="pb-1 text-sm text-muted">
          Lido: {parsed.detectedBank}{parsed.detectedHolder ? ` · ${parsed.detectedHolder}` : ''}
          {parsed.advancePaymentCents > 0 && <> · pagamento antecipado R$ {formatBRL(parsed.advancePaymentCents)}</>}
        </p>
      </div>
      {existing && dueMonth && <p role="status" className="font-semibold text-warn">{replaceWarning(dueMonth, existing.paid)}</p>}
      <ReviewTable rows={rows} reconciled={reconciled} categories={snapshot.categories} expenses={snapshot.expenses}
        totalCents={totalCents} onChange={setRows} />
      {(problem ?? save.error) && (
        <p role="alert" className="text-sm font-semibold text-warn">{problem ?? (save.error as Error).message}</p>
      )}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="rounded-inner border border-line px-4 py-1.5 font-bold">Cancelar</button>
        <button type="button" onClick={submit} disabled={!!problem || save.isPending}
          className="rounded-inner bg-accent px-4 py-1.5 font-bold text-white disabled:opacity-60">
          {save.isPending ? 'Salvando…' : 'Salvar fatura'}
        </button>
      </div>
    </div>
  );
}
