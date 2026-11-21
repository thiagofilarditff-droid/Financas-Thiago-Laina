import { useState } from 'react';
import type { Card, Invoice, Month, Snapshot } from '../../domain/types';
import { addMonths, compareMonth, monthLabel } from '../../domain/month';
import { formatBRL, parseBRL } from '../../domain/money';
import { projectedItemsFor } from '../../domain/installments';
import { setInvoicePaid, useWrite } from '../../data/mutations';
import { adjustmentCents } from '../import/review';
import MonthPicker from '../../ui/MonthPicker';
import Money from '../../ui/Money';
import { input } from './CardForm';

const badge = 'rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent';
const dmy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—');

export const replaceWarning = (m: Month) => `Já existe uma fatura de ${monthLabel(m)} para este cartão. Salvar vai substituí-la.`;

function InvoiceRow({ invoice, snapshot }: { invoice: Invoice; snapshot: Snapshot }) {
  const [open, setOpen] = useState(false);
  const paid = useWrite((v: boolean) => setInvoicePaid(invoice.id, v));
  const items = snapshot.items.filter((i) => i.invoiceId === invoice.id);
  const adj = adjustmentCents(invoice.totalCents, items);
  return (
    <li className="border-b border-line py-2">
      <div className="flex items-center gap-4">
        <div className="w-24 font-bold">{monthLabel(invoice.dueMonth)}</div>
        <div className="w-28 text-sm text-muted">vence {dmy(invoice.dueDate)}</div>
        <span className={badge}>{invoice.source === 'pdf' ? 'PDF' : 'Manual'}</span>
        <div className="flex-1 text-right font-extrabold"><Money cents={invoice.totalCents} symbol /></div>
        <button type="button" disabled={paid.isPending} onClick={() => paid.mutate(!invoice.paid)}
          aria-pressed={invoice.paid}
          className={`w-36 rounded-inner border px-2 py-1 text-sm font-bold ${invoice.paid ? 'border-good bg-accent-soft text-good' : 'border-line text-muted'}`}>
          {invoice.paid ? '✓ Paga' : 'Marcar como paga'}
        </button>
        <button type="button" onClick={() => setOpen(!open)} disabled={items.length === 0}
          className="w-24 text-sm font-bold text-accent disabled:text-muted disabled:opacity-60">
          {items.length === 0 ? 'Sem itens' : open ? 'Ocultar itens' : `Ver itens (${items.length})`}
        </button>
      </div>
      {paid.error && <p role="alert" className="text-sm font-semibold text-warn">{(paid.error as Error).message}</p>}
      {open && (
        <table className="mt-2 w-full text-sm">
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t border-line">
                <td className="w-16 py-1 text-muted">{dmy(i.date)}</td>
                <td>{i.description}</td>
                <td className="text-muted">{i.category}</td>
                <td className="w-16 text-muted">{i.installmentN !== null ? `${i.installmentN}/${i.installmentTotal}` : ''}</td>
                <td className="w-28 text-right"><Money cents={i.amountCents} /></td>
              </tr>
            ))}
            {adj !== 0 && (
              <tr className="border-t border-line text-muted">
                <td /><td colSpan={3}>Ajuste (encargos, IOF, pagamentos)</td>
                <td className="text-right"><Money cents={adj} /></td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </li>
  );
}

/** Invoices of one card by due month (newest first), followed by months that only have projected installments. */
export default function CardInvoices({ card, snapshot, today }: { card: Card; snapshot: Snapshot; today: Month }) {
  const invoices = snapshot.invoices.filter((i) => i.cardId === card.id)
    .sort((a, b) => compareMonth(b.dueMonth, a.dueMonth));
  const invoiced = new Set(invoices.map((i) => i.dueMonth));
  const projectedMonths = [...new Set(snapshot.plans.filter((p) => p.cardId === card.id).flatMap((p) =>
    Array.from({ length: p.totalInstallments }, (_, k) => addMonths(p.firstDueMonth, k))))]
    .filter((m) => !invoiced.has(m) && compareMonth(m, today) >= 0)
    .sort(compareMonth)
    // All household items/invoices/plans go in, so installments already invoiced are not counted again.
    .map((m) => ({ month: m, items: projectedItemsFor(snapshot.plans, snapshot.items, snapshot.invoices, card.id, m) }))
    .filter((p) => p.items.length > 0);

  return (
    <div>
      {invoices.length === 0 && projectedMonths.length === 0 && <p className="text-sm text-muted">Nenhuma fatura ainda.</p>}
      <ul>{invoices.map((i) => <InvoiceRow key={i.id} invoice={i} snapshot={snapshot} />)}</ul>
      {projectedMonths.length > 0 && (
        <ul className="mt-2">
          {projectedMonths.map(({ month: m, items: proj }) => (
            <li key={m} className="flex items-center gap-4 border-b border-dashed border-line py-2 text-muted">
              <div className="w-24 font-bold">{monthLabel(m)}</div>
              <div className="flex-1 text-sm italic">
                prevista · {proj.map((p) => `${p.description} ${p.installmentN}/${p.installmentTotal}`).join(', ')}
              </div>
              <div className="font-bold italic"><Money cents={proj.reduce((s, p) => s + p.amountCents, 0)} symbol /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ManualProps {
  card: Card;
  snapshot: Snapshot;
  month: Month;
  busy?: boolean;
  error?: string | null;
  onCancel(): void;
  onSubmit(dueMonth: Month, totalCents: number): void;
}

/** "Lançar total à mão": only the invoice total, for when the PDF fails or the bank is not supported. */
export function ManualInvoiceForm({ card, snapshot, month, busy, error, onCancel, onSubmit }: ManualProps) {
  const [dueMonth, setDueMonth] = useState<Month>(month);
  const [total, setTotal] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const existing = snapshot.invoices.find((i) => i.cardId === card.id && i.dueMonth === dueMonth);

  function submit() {
    const cents = parseBRL(total);
    if (cents === null) {
      setProblem('Informe um total válido (ex.: 1.234,56).');
      return;
    }
    setProblem(null);
    onSubmit(dueMonth, cents);
  }

  const shown = problem ?? error;
  return (
    <div className="flex flex-col gap-3 rounded-inner bg-accent-soft p-4">
      <div className="flex items-end gap-4">
        <div className="text-sm font-semibold">Fatura que vence em
          <div className="mt-1"><MonthPicker value={dueMonth} onChange={setDueMonth} /></div></div>
        <label className="text-sm font-semibold">Total da fatura
          <input className={`${input} mt-1 block`} value={total} inputMode="decimal" onChange={(e) => setTotal(e.target.value)} /></label>
        {existing && <span className="pb-1 text-sm text-muted">atual: R$ {formatBRL(existing.totalCents)}</span>}
      </div>
      {existing && <p role="status" className="text-sm font-semibold text-warn">{replaceWarning(dueMonth)}</p>}
      {shown && <p role="alert" className="text-sm font-semibold text-warn">{shown}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="rounded-inner border border-line bg-card px-4 py-1.5 font-bold">Cancelar</button>
        <button type="button" onClick={submit} disabled={busy}
          className="rounded-inner bg-accent px-4 py-1.5 font-bold text-white disabled:opacity-60">Salvar fatura</button>
      </div>
    </div>
  );
}
