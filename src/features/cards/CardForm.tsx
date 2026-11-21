import { useState } from 'react';
import type { Card, Person } from '../../domain/types';
import { formatBRL, parseBRL } from '../../domain/money';

export type CardDraft = Omit<Card, 'id'> & { id?: string };

export const CARD_COLORS = ['#0f7a64', '#3d9c87', '#74bba9', '#a8d6ca', '#e0a458', '#c9774d', '#8a6fb0', '#5b8def', '#9aa5ba'];

interface Props {
  people: Person[];
  initial: Card | null;
  busy?: boolean;
  error?: string | null;
  onCancel(): void;
  onSubmit(c: CardDraft): void;
}

export const input = 'rounded-inner border border-line bg-card px-2 py-1 outline-none focus:border-accent';

const validDay = (s: string) => /^\d{1,2}$/.test(s) && Number(s) >= 1 && Number(s) <= 31;

export default function CardForm({ people, initial, busy, error, onCancel, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [bank, setBank] = useState(initial?.bank ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [last4, setLast4] = useState(initial?.last4 ?? '');
  const [holder, setHolder] = useState(initial?.holderPersonId ?? '');
  const [limit, setLimit] = useState(initial ? formatBRL(initial.limitCents) : '');
  const [closingDay, setClosingDay] = useState(initial ? String(initial.closingDay) : '');
  const [dueDay, setDueDay] = useState(initial ? String(initial.dueDay) : '');
  const [color, setColor] = useState(initial?.color ?? CARD_COLORS[0]);
  const [problem, setProblem] = useState<string | null>(null);

  function submit() {
    const limitCents = limit.trim() === '' ? 0 : parseBRL(limit);
    if (!name.trim()) return setProblem('Informe o nome do cartão.');
    if (last4 && !/^\d{4}$/.test(last4)) return setProblem('Informe só os 4 últimos dígitos do cartão.');
    if (limitCents === null || limitCents < 0) return setProblem('Informe um limite válido (ex.: 10.000,00).');
    if (!validDay(closingDay) || !validDay(dueDay)) return setProblem('Os dias de fechamento e vencimento devem estar entre 1 e 31.');
    setProblem(null);
    onSubmit({
      ...(initial ? { id: initial.id } : {}),
      name: name.trim(), bank: bank.trim(), brand: brand.trim(), last4: last4 || null, holderPersonId: holder || null,
      limitCents, closingDay: Number(closingDay), dueDay: Number(dueDay), color, archived: initial?.archived ?? false,
    });
  }

  const shown = problem ?? error;
  return (
    <div className="grid grid-cols-3 gap-3 rounded-inner bg-accent-soft p-4">
      <label className="text-sm font-semibold">Nome
        <input className={`${input} mt-1 w-full`} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="text-sm font-semibold">Banco
        <input className={`${input} mt-1 w-full`} value={bank} onChange={(e) => setBank(e.target.value)} /></label>
      <label className="text-sm font-semibold">Bandeira
        <input className={`${input} mt-1 w-full`} value={brand} onChange={(e) => setBrand(e.target.value)} /></label>
      <label className="text-sm font-semibold">4 últimos dígitos
        <input className={`${input} mt-1 w-full`} value={last4} inputMode="numeric" maxLength={4}
          onChange={(e) => setLast4(e.target.value.replace(/\D/g, ''))} /></label>
      <label className="text-sm font-semibold">Titular
        <select className={`${input} mt-1 w-full`} value={holder} onChange={(e) => setHolder(e.target.value)}>
          <option value="">—</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
      <label className="text-sm font-semibold">Limite
        <input className={`${input} mt-1 w-full`} value={limit} inputMode="decimal" onChange={(e) => setLimit(e.target.value)} /></label>
      <label className="text-sm font-semibold">Dia de fechamento
        <input className={`${input} mt-1 w-full`} value={closingDay} inputMode="numeric" onChange={(e) => setClosingDay(e.target.value)} /></label>
      <label className="text-sm font-semibold">Dia de vencimento
        <input className={`${input} mt-1 w-full`} value={dueDay} inputMode="numeric" onChange={(e) => setDueDay(e.target.value)} /></label>
      <fieldset className="text-sm font-semibold">
        <legend>Cor</legend>
        <div className="mt-1 flex gap-1">
          {CARD_COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full border-2 ${color === c ? 'border-fg' : 'border-transparent'}`} style={{ background: c }} />
          ))}
        </div>
      </fieldset>
      {shown && <p role="alert" className="col-span-3 text-sm font-semibold text-warn">{shown}</p>}
      <div className="col-span-3 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="rounded-inner border border-line bg-card px-4 py-1.5 font-bold">Cancelar</button>
        <button type="button" onClick={submit} disabled={busy}
          className="rounded-inner bg-accent px-4 py-1.5 font-bold text-white disabled:opacity-60">Salvar cartão</button>
      </div>
    </div>
  );
}
