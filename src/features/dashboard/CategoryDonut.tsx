import { Cell, Pie, PieChart } from 'recharts';
import type { Cents, Month } from '../../domain/types';
import { monthName } from '../../domain/month';
import { formatBRL } from '../../domain/money';

const PALETTE_SIZE = 9;
/** The --cat-N tokens of styles.css, in order. */
const color = (i: number) => `var(--cat-${(i % PALETTE_SIZE) + 1})`;

const thousands = (c: Cents) => `${(c / 100000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`;

export default function CategoryDonut({ categories, month }: { categories: { category: string; cents: Cents }[]; month: Month }) {
  const total = categories.reduce((sum, c) => sum + c.cents, 0);
  return (
    <section className="min-w-0 rounded-card border border-line bg-card px-[18px] py-4">
      <h2 className="mb-2.5 flex justify-between text-[0.95rem] font-bold">
        Para onde foi o dinheiro
        <small className="text-sm font-normal text-muted">{monthName(month).toLowerCase()}</small>
      </h2>
      {categories.length === 0 ? <p className="text-sm text-muted">Nenhuma despesa neste mês.</p> : (
        <div className="grid grid-cols-[150px_1fr] items-center gap-3.5">
          <div className="relative h-[150px] w-[150px]" role="img" aria-label="Despesas por categoria">
            <PieChart width={150} height={150}>
              <Pie data={categories} dataKey="cents" nameKey="category" cx="50%" cy="50%" innerRadius={42} outerRadius={66}
                startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
                {categories.map((c, i) => <Cell key={c.category} fill={color(i)} />)}
              </Pie>
            </PieChart>
            <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
              <span className="text-[9px] text-muted">{monthName(month)}</span>
              <span className="text-[13px] font-bold">{thousands(total)}</span>
            </div>
          </div>
          <ul className="grid gap-1.5 text-[0.8rem]">
            {categories.map((c, i) => (
              <li key={c.category} className="grid grid-cols-[10px_1fr_auto] items-center gap-2">
                <i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color(i) }} />
                <span>{c.category}</span>
                <b className="font-semibold tabular-nums">{formatBRL(c.cents)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
