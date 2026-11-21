import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GridRow, MonthlyGrid } from '../../domain/grid';
import type { Cents, Month, Snapshot } from '../../domain/types';
import { monthShort } from '../../domain/month';
import { formatBRL } from '../../domain/money';
import { setEntry, setInvoicePaid, useWrite } from '../../data/mutations';
import { useHouseholdId } from '../../data/auth';
import GridCell from './GridCell';

const stickyCol = 'sticky left-0 z-10 bg-card px-3 py-2 text-left';
const sectionRow = 'bg-accent-soft px-3 py-2 text-left text-sm font-extrabold';

function Amount({ cents, warn = false }: { cents: Cents; warn?: boolean }) {
  return <span className={`tabular-nums ${warn && cents < 0 ? 'text-warn' : ''}`}>{formatBRL(cents)}</span>;
}

export default function GridTable({ grid, snapshot }: { grid: MonthlyGrid; snapshot: Snapshot }) {
  const householdId = useHouseholdId();
  const navigate = useNavigate();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const entry = useWrite((a: { expenseId: string; month: Month; patch: { amountCents?: Cents; paid?: boolean } }) =>
    setEntry(householdId, a.expenseId, a.month, a.patch));
  const invoice = useWrite((a: { id: string; paid: boolean }) => setInvoicePaid(a.id, a.paid));

  const cardRows = grid.expenseRows.filter((r) => r.kind === 'card');
  const allOpen = cardRows.length > 0 && cardRows.every((r) => open.has(r.key));
  const toggle = (key: string) => setOpen((o) => { const n = new Set(o); if (!n.delete(key)) n.add(key); return n; });
  const toggleAll = () => setOpen(allOpen ? new Set() : new Set(cardRows.map((r) => r.key)));
  const error = ((entry.error ?? invoice.error) as Error | null)?.message;

  const renderRow = (row: GridRow) => {
    const locked = row.kind === 'expense' && !!snapshot.expenses.find((e) => e.id === row.refId)?.payrollDeducted;
    const cats = row.breakdown
      ? [...new Set(grid.months.flatMap((m) => (row.breakdown![m] ?? []).map((p) => p.category)))] : [];
    return (
      <Fragment key={row.key}>
        <tr className="border-t border-line">
          <th scope="row" className={`${stickyCol} font-semibold`}>
            <div className="flex items-center gap-2">
              <span>{row.label}</span>
              {row.kind === 'card' && (
                <button type="button" aria-expanded={open.has(row.key)} onClick={() => toggle(row.key)}
                  className="text-xs font-bold text-accent">
                  {open.has(row.key) ? 'Recolher' : 'Desmembrar'}
                </button>
              )}
            </div>
            {row.sublabel && <div className="text-xs font-normal text-muted">{row.sublabel}</div>}
          </th>
          {grid.months.map((m) => {
            const cell = row.cells[m];
            const label = `${row.label}, ${monthShort(m)}`;
            const invoiceId = row.kind === 'card'
              ? snapshot.invoices.find((i) => i.cardId === row.refId && i.dueMonth === m)?.id : undefined;
            return (
              <td key={m} className="px-1 py-1 text-right">
                <GridCell cell={cell} kind={row.kind} label={label} locked={locked}
                  onTogglePaid={() => {
                    const paid = cell.state !== 'paid';
                    if (row.kind === 'card') { if (invoiceId) invoice.mutate({ id: invoiceId, paid }); }
                    else entry.mutate({ expenseId: row.refId, month: m, patch: { paid } });
                  }}
                  onOpenCard={() => navigate(`/cartoes?card=${row.refId}`)}
                  onEdit={(amountCents) => entry.mutate({ expenseId: row.refId, month: m, patch: { amountCents } })} />
              </td>
            );
          })}
        </tr>
        {open.has(row.key) && cats.map((c) => (
          <tr key={`${row.key}:${c}`} className="text-sm text-muted">
            <th scope="row" className={`${stickyCol} pl-8 font-normal`}>{c}</th>
            {grid.months.map((m) => {
              const p = row.breakdown![m]?.find((x) => x.category === c);
              return <td key={m} className="px-3 py-1 text-right">{p ? <Amount cents={p.cents} /> : '–'}</td>;
            })}
          </tr>
        ))}
      </Fragment>
    );
  };

  const totalRow = (label: string, f: (m: Month) => Cents, warn = false, strong = false) => (
    <tr className={`border-t border-line ${strong ? 'font-extrabold' : 'font-bold'}`}>
      <th scope="row" className={stickyCol}>{label}</th>
      {grid.months.map((m) => <td key={m} className="px-3 py-2 text-right"><Amount cents={f(m)} warn={warn} /></td>)}
    </tr>
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-end">
        {cardRows.length > 0 && (
          <button type="button" onClick={toggleAll} className="text-sm font-bold text-accent">
            {allOpen ? 'Recolher todos os cartões' : 'Desmembrar todos os cartões'}
          </button>
        )}
      </div>
      {error && <p role="alert" className="mb-2 text-sm font-semibold text-warn">{error}</p>}
      <div className="overflow-x-auto rounded-card border border-line bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={`${stickyCol} text-xs uppercase text-muted`}>{grid.year}</th>
              {grid.months.map((m) => <th key={m} scope="col" className="px-3 py-2 text-right text-xs font-extrabold text-muted">{monthShort(m)}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr><th colSpan={13} className={sectionRow}>1. Receitas</th></tr>
            {grid.incomeRows.map(renderRow)}
            {totalRow('Total das receitas', (m) => grid.totals[m].incomeCents, false, true)}
            <tr><th colSpan={13} className={sectionRow}>2. Despesas</th></tr>
            {grid.expenseRows.map(renderRow)}
            {totalRow('Despesas pagas', (m) => grid.totals[m].paidCents)}
            {totalRow('Despesas previstas', (m) => grid.totals[m].expectedCents)}
            {totalRow('Saldo previsto', (m) => grid.totals[m].balanceCents, true, true)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
