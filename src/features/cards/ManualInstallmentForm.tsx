import { useState } from 'react';
import type { Cents, Month } from '../../domain/types';
import { formatBRL, parseBRL } from '../../domain/money';
import MonthPicker from '../../ui/MonthPicker';
import { input } from './CardForm';

export interface ManualPlanDraft { description: string; installmentCents: Cents; total: number; firstDueMonth: Month }

interface Props {
  month: Month;
  busy?: boolean;
  error?: string | null;
  onCancel(): void;
  onSubmit(p: ManualPlanDraft): void;
}

/** "Compra parcelada": an installment purchase entered by hand (the exception; imports create them). */
export default function ManualInstallmentForm({ month, busy, error, onCancel, onSubmit }: Props) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [total, setTotal] = useState('');
  const [firstDueMonth, setFirstDueMonth] = useState<Month>(month);
  const [problem, setProblem] = useState<string | null>(null);

  const cents = parseBRL(amount);
  const n = /^\d{1,2}$/.test(total) ? Number(total) : null;

  function submit() {
    if (!description.trim() || cents === null || cents <= 0 || n === null || n < 1) {
      setProblem('Informe a descrição, o valor da parcela e o número de parcelas.');
      return;
    }
    setProblem(null);
    onSubmit({ description: description.trim(), installmentCents: cents, total: n, firstDueMonth });
  }

  const shown = problem ?? error;
  return (
    <div className="grid grid-cols-4 gap-3 rounded-inner bg-accent-soft p-4">
      <label className="col-span-2 text-sm font-semibold">Descrição
        <input className={`${input} mt-1 w-full`} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <label className="text-sm font-semibold">Valor da parcela
        <input className={`${input} mt-1 w-full`} value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} /></label>
      <label className="text-sm font-semibold">Parcelas
        <input className={`${input} mt-1 w-full`} value={total} inputMode="numeric" onChange={(e) => setTotal(e.target.value)} /></label>
      <div className="text-sm font-semibold">1ª parcela na fatura de
        <div className="mt-1"><MonthPicker value={firstDueMonth} onChange={setFirstDueMonth} /></div></div>
      {cents !== null && n !== null && n > 0 && (
        <p className="col-span-3 self-end text-sm text-muted">{n}× de R$ {formatBRL(cents)} = R$ {formatBRL(cents * n)}</p>
      )}
      {shown && <p role="alert" className="col-span-4 text-sm font-semibold text-warn">{shown}</p>}
      <div className="col-span-4 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="rounded-inner border border-line bg-card px-4 py-1.5 font-bold">Cancelar</button>
        <button type="button" onClick={submit} disabled={busy}
          className="rounded-inner bg-accent px-4 py-1.5 font-bold text-white disabled:opacity-60">Salvar compra parcelada</button>
      </div>
    </div>
  );
}
