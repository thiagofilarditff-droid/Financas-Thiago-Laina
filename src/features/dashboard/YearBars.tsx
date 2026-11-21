import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DashboardBar } from '../../domain/dashboard';
import type { Month } from '../../domain/types';
import { monthLabel } from '../../domain/month';
import { formatBRL } from '../../domain/money';

const INCOME = '#9fd3c5';
const EXPENSES = '#0f7a64';
const FUTURE_OPACITY = 0.45;

const short = (m: Month) => monthLabel(m).split('/')[0];
const thousands = (reais: number) => `${Math.round(reais / 1000)}k`;

/** Round y-axis ticks (in reais) from 0 to just above `max`: about four steps of 1, 2 or 5 × 10ⁿ. */
function ticks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((f) => f * pow).find((s) => s >= raw)!;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

export default function YearBars({ bars, selected }: { bars: DashboardBar[]; selected: Month }) {
  const year = selected.slice(0, 4);
  const data = bars.map((b) => ({ ...b, income: b.incomeCents / 100, expenses: b.expensesCents / 100 }));
  const yTicks = ticks(Math.max(...data.map((b) => Math.max(b.income, b.expenses))));
  const empty = bars.every((b) => b.incomeCents === 0 && b.expensesCents === 0);
  return (
    <section className="min-w-0 rounded-card border border-line bg-card px-[18px] py-4">
      <h2 className="mb-2.5 flex justify-between text-[0.95rem] font-bold">
        Receitas × despesas em {year}
        <small className="text-sm font-normal text-muted">
          <span style={{ color: INCOME }}>■</span> receitas &nbsp;<span style={{ color: EXPENSES }}>■</span> despesas
        </small>
      </h2>
      {empty ? <p className="text-sm text-muted">Nenhum lançamento em {year}.</p> : (
        <div className="h-[220px]" role="img" aria-label={`Receitas e despesas por mês em ${year}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2} barSize={13} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="month" interval={0} tickLine={false} axisLine={false}
                tick={({ x, y, payload }) => (
                  <text x={x} y={Number(y) + 12} textAnchor="middle" fontSize={10} fill="var(--muted)"
                    fontWeight={payload.value === selected ? 700 : 400}>{short(payload.value)}</text>
                )} />
              <YAxis ticks={yTicks} domain={[0, yTicks[yTicks.length - 1]]} tickFormatter={thousands} tickLine={false} axisLine={false} width={36} fontSize={10} tick={{ fill: 'var(--muted)' }} />
              <Tooltip cursor={{ fill: 'var(--accent-soft)' }} labelFormatter={(m) => monthLabel(String(m))}
                formatter={(v, name) => [formatBRL(Math.round(Number(v) * 100), { symbol: true }), name === 'income' ? 'Receitas' : 'Despesas']} />
              <Bar dataKey="income" fill={INCOME} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {data.map((b) => <Cell key={b.month} fillOpacity={b.future ? FUTURE_OPACITY : 1} />)}
              </Bar>
              <Bar dataKey="expenses" fill={EXPENSES} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {data.map((b) => <Cell key={b.month} fillOpacity={b.future ? FUTURE_OPACITY : 1} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
