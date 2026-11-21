import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { buildMonthlyGrid } from '../../domain/grid';
import { currentMonth } from '../../domain/month';
import { useSnapshot } from '../../data/snapshot';
import GridTable from './GridTable';

/** `exportSlot` is where the export button (Task 14) is rendered, next to the year selector. */
export default function GridPage({ exportSlot }: { exportSlot?: (year: number) => ReactNode }) {
  const { data: snapshot, isLoading, error } = useSnapshot();
  const [params, setParams] = useSearchParams();
  const thisYear = Number(currentMonth().slice(0, 4));
  const parsed = Number(params.get('ano'));
  const year = Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : thisYear;

  if (isLoading) return <p className="text-muted">Carregando…</p>;
  if (error || !snapshot) return <p role="alert" className="font-semibold text-warn">Não consegui carregar os dados.</p>;

  const grid = buildMonthlyGrid(snapshot, year);
  const years = Array.from({ length: 7 }, (_, i) => thisYear - 3 + i);
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold">Mês a mês</h1>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-bold text-accent">
            {grid.paidCountYear} lançamentos pagos no ano
          </span>
          <label className="flex items-center gap-2 text-sm font-semibold">
            Ano
            <select value={year} onChange={(e) => setParams({ ano: e.target.value })}
              className="rounded-inner border border-line bg-card px-2 py-1">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          {exportSlot?.(year)}
        </div>
      </div>
      <GridTable grid={grid} snapshot={snapshot} />
    </div>
  );
}
