import { useSearchParams } from 'react-router-dom';
import type { Month } from '../../domain/types';
import { buildDashboard, type DashboardBill } from '../../domain/dashboard';
import { addMonths, currentMonth, monthLabel, monthName } from '../../domain/month';
import { useSnapshot } from '../../data/snapshot';
import { useHouseholdId } from '../../data/auth';
import { setEntry, setInvoicePaid, useWrite } from '../../data/mutations';
import Kpis from './Kpis';
import YearBars from './YearBars';
import BillsList from './BillsList';
import CategoryDonut from './CategoryDonut';
import CardsSummary from './CardsSummary';

const MONTH_PARAM = /^\d{4}-(0[1-9]|1[0-2])$/;

export default function DashboardPage() {
  const { data: snapshot, isLoading, error } = useSnapshot();
  const householdId = useHouseholdId();
  const [params, setParams] = useSearchParams();
  const raw = params.get('mes') ?? '';
  const month: Month = MONTH_PARAM.test(raw) ? raw : currentMonth();
  const entry = useWrite((a: { expenseId: string; month: Month; paid: boolean }) =>
    setEntry(householdId, a.expenseId, a.month, { paid: a.paid }));
  const invoice = useWrite((a: { id: string; paid: boolean }) => setInvoicePaid(a.id, a.paid));

  if (isLoading) return <p className="text-muted">Carregando…</p>;
  if (error || !snapshot) return <p role="alert" className="font-semibold text-warn">Não consegui carregar os dados.</p>;

  const d = buildDashboard(snapshot, month);
  const writeError = ((entry.error ?? invoice.error) as Error | null)?.message;
  const toggle = (b: DashboardBill, paid: boolean) => {
    if (b.kind === 'card') { if (b.invoiceId) invoice.mutate({ id: b.invoiceId, paid }); }
    else entry.mutate({ expenseId: b.refId, month, paid });
  };

  return (
    <div className="grid content-start gap-[18px]">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[1.4rem] font-bold">{monthName(month)} {month.slice(0, 4)}</h1>
        <nav aria-label="Mês" className="flex gap-1.5">
          {[-1, 0, 1].map((n) => {
            const m = addMonths(month, n);
            const on = n === 0;
            return (
              <button key={m} type="button" aria-current={on ? 'date' : undefined} title={monthLabel(m)}
                onClick={() => setParams({ mes: m })}
                className={`rounded-full border px-3 py-1.5 text-[0.8rem] font-medium ${on ? 'border-accent bg-accent text-white' : 'border-line hover:bg-accent-soft'}`}>
                {monthLabel(m).split('/')[0]}
              </button>
            );
          })}
        </nav>
      </div>
      {writeError && <p role="alert" className="text-sm font-semibold text-warn">{writeError}</p>}
      <Kpis dashboard={d} />
      <div className="grid grid-cols-[1.6fr_1fr] gap-3.5">
        <YearBars bars={d.bars} selected={month} />
        <BillsList bills={d.bills} month={month} onToggle={toggle} />
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        <CategoryDonut categories={d.categories} month={month} />
        <CardsSummary cards={d.cards} month={month} />
      </div>
    </div>
  );
}
