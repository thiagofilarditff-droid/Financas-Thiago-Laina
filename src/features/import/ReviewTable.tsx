import type { Cents, Expense } from '../../domain/types';
import type { ReconciledItem } from '../../domain/installments';
import Money from '../../ui/Money';
import { adjustmentCents, emptyRow, reviewBadge, sumCents, type ReviewRow } from './review';

interface Props {
  rows: ReviewRow[];
  /** Aligned with `rows`; null where the row is invalid. */
  reconciled: (ReconciledItem | null)[];
  categories: string[];
  expenses: Expense[];
  totalCents: Cents | null;
  onChange(rows: ReviewRow[]): void;
}

const cell = 'w-full rounded-inner border border-line bg-card px-2 py-1 outline-none focus:border-accent';
const badge = 'whitespace-nowrap rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent';

export default function ReviewTable({ rows, reconciled, categories, expenses, totalCents, onChange }: Props) {
  const set = (i: number, patch: Partial<ReviewRow>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  // e.g. an installment the reading listed twice, which would otherwise create a second purchase.
  const remove = (i: number) => onChange(rows.filter((_, k) => k !== i));
  const valid = reconciled.filter((r): r is ReconciledItem => r !== null);
  const sum = sumCents(valid);
  const adj = totalCents === null ? 0 : adjustmentCents(totalCents, valid);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-muted">
          <th className="w-36 py-1">Data</th><th>Descrição</th><th className="w-32">Valor</th>
          <th className="w-40">Categoria</th><th className="w-20">Parcela</th><th className="w-52" /><th className="w-20" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const rec = reconciled[i];
          const label = rec ? reviewBadge(rec, expenses) : null;
          const options = r.category && !categories.includes(r.category) ? [...categories, r.category] : categories;
          return (
            <tr key={i} className={`border-t border-line ${rec ? '' : 'bg-warn/10'}`}>
              <td className="py-1 pr-1"><input type="date" aria-label={`Data do item ${i + 1}`} className={cell} value={r.date}
                onChange={(e) => set(i, { date: e.target.value })} /></td>
              <td className="pr-1"><input aria-label={`Descrição do item ${i + 1}`} className={cell} value={r.description}
                onChange={(e) => set(i, { description: e.target.value })} /></td>
              <td className="pr-1"><input aria-label={`Valor do item ${i + 1}`} inputMode="decimal" className={`${cell} text-right`}
                value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} /></td>
              <td className="pr-1">
                <select aria-label={`Categoria do item ${i + 1}`} className={cell} value={r.category}
                  onChange={(e) => set(i, { category: e.target.value })}>
                  <option value="">Selecione…</option>
                  {options.map((c) => <option key={c} value={c}>{c}</option>)}
                </select></td>
              <td className="pr-1"><input aria-label={`Parcela do item ${i + 1}`} placeholder="n/N" className={cell} value={r.installment}
                onChange={(e) => set(i, { installment: e.target.value })} /></td>
              <td>{rec ? label && <span className={badge}>{label}</span>
                : <span className="text-xs font-bold text-warn">Corrija este item</span>}</td>
              <td className="text-right"><button type="button" aria-label={`Remover item ${i + 1}`} onClick={() => remove(i)}
                className="text-xs font-bold text-warn">Remover</button></td>
            </tr>
          );
        })}
        <tr>
          <td colSpan={7} className="py-2">
            <button type="button" onClick={() => onChange([...rows, emptyRow()])} className="text-sm font-bold text-accent">
              + Adicionar item</button></td>
        </tr>
      </tbody>
      <tfoot className="font-bold">
        <tr className="border-t-2 border-line"><td colSpan={2} className="py-1">Soma dos itens</td>
          <td className="text-right"><Money cents={sum} /></td><td colSpan={4} /></tr>
        <tr><td colSpan={2} className="py-1">Total da fatura</td>
          <td className="text-right">{totalCents === null ? '—' : <Money cents={totalCents} />}</td><td colSpan={4} /></tr>
        {adj !== 0 && (
          <tr className="text-warn"><td colSpan={2} className="py-1">Ajuste <span className="font-normal text-muted">(encargos, IOF, pagamentos)</span></td>
            <td className="text-right"><Money cents={adj} /></td><td colSpan={4} /></tr>
        )}
      </tfoot>
    </table>
  );
}
