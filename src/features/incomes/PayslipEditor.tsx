import { useState } from 'react';
import type { Month, Payslip, PayslipLine } from '../../domain/types';
import { formatBRL, parseBRL } from '../../domain/money';
import { currentMonth } from '../../domain/month';
import MonthPicker from '../../ui/MonthPicker';

interface Row { kind: PayslipLine['kind']; label: string; value: string }

interface Props {
  personName: string;
  initial: Payslip | null;
  busy?: boolean;
  error?: string | null;
  onCancel(): void;
  onSave(validFrom: Month, lines: PayslipLine[]): void;
}

export default function PayslipEditor({ personName, initial, busy, error, onCancel, onSave }: Props) {
  const [validFrom, setValidFrom] = useState<Month>(currentMonth());
  const [rows, setRows] = useState<Row[]>(
    (initial?.lines ?? []).map((l) => ({ kind: l.kind, label: l.label, value: formatBRL(l.amountCents) })),
  );
  const [problem, setProblem] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function save() {
    const lines: PayslipLine[] = [];
    for (const [i, r] of rows.entries()) {
      const cents = parseBRL(r.value);
      if (!r.label.trim() || cents === null || cents < 0) {
        setProblem(`Linha ${i + 1}: informe o nome e um valor válido (ex.: 1.234,56).`);
        return;
      }
      lines.push({ kind: r.kind, label: r.label.trim(), amountCents: cents, order: i });
    }
    setProblem(null);
    onSave(validFrom, lines);
  }

  const input = 'rounded-inner border border-line bg-card px-2 py-1 outline-none focus:border-accent';
  return (
    <div role="dialog" aria-modal="true" aria-label={`Editar contracheque de ${personName}`}
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-6">
      <div className="max-h-full w-full max-w-3xl overflow-auto rounded-card bg-card p-6">
        <h2 className="mb-4 text-xl font-extrabold">Contracheque de {personName}</h2>
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm font-semibold">Vale a partir de</span>
          <MonthPicker value={validFrom} onChange={setValidFrom} />
        </div>
        <p className="mb-3 text-sm text-muted">Meses anteriores continuam com o contracheque antigo.</p>
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className={`${input} flex-1`} aria-label={`Nome da linha ${i + 1}`} value={r.label}
                onChange={(e) => update(i, { label: e.target.value })} />
              <select className={input} aria-label={`Tipo da linha ${i + 1}`} value={r.kind}
                onChange={(e) => update(i, { kind: e.target.value as Row['kind'] })}>
                <option value="provento">Provento</option>
                <option value="desconto">Desconto</option>
              </select>
              <input className={`${input} w-32 text-right`} aria-label={`Valor da linha ${i + 1}`} value={r.value}
                onChange={(e) => update(i, { value: e.target.value })} />
              <button type="button" aria-label={`Remover linha ${i + 1}`} className="px-2 font-bold text-warn"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
        <button type="button" className="mt-3 text-sm font-bold text-accent"
          onClick={() => setRows((rs) => [...rs, { kind: 'provento', label: '', value: '' }])}>+ Adicionar linha</button>
        {(problem || error) && <p role="alert" className="mt-3 text-sm font-semibold text-warn">{problem ?? error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-inner border border-line px-4 py-2 font-bold">Cancelar</button>
          <button type="button" onClick={save} disabled={busy}
            className="rounded-inner bg-accent px-4 py-2 font-bold text-white disabled:opacity-60">
            {busy ? 'Salvando…' : 'Salvar contracheque'}
          </button>
        </div>
      </div>
    </div>
  );
}
