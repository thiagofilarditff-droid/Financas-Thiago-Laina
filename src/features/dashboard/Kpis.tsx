import type { Dashboard } from '../../domain/dashboard';
import { formatBRL } from '../../domain/money';

function Tile({ label, cents, note, hero = false }: { label: string; cents: number; note: string; hero?: boolean }) {
  return (
    <div className={`rounded-card border px-[18px] py-4 ${hero ? 'border-accent bg-accent text-white' : 'border-line bg-card'}`}>
      <div className={`text-[0.72rem] uppercase tracking-[0.07em] ${hero ? 'text-[#cfe9e1]' : 'text-muted'}`}>{label}</div>
      <div className="mt-1 text-[1.45rem] font-bold tabular-nums">{formatBRL(cents, { symbol: true })}</div>
      <div className={`mt-0.5 text-[0.78rem] ${hero ? 'text-[#cfe9e1]' : 'text-muted'}`}>{note}</div>
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function Kpis({ dashboard: d }: { dashboard: Dashboard }) {
  const accounts = d.bills.filter((b) => b.kind === 'expense').length;
  const invoices = d.bills.filter((b) => b.kind === 'card').length;
  const open = d.bills.filter((b) => !b.paid).length;
  return (
    <div className="grid grid-cols-4 gap-3.5">
      <Tile label="Receitas líquidas" cents={d.kpis.incomeCents}
        note={d.incomes.length ? d.incomes.map((i) => `${i.label} ${formatBRL(i.cents)}`).join(' · ') : 'Nenhuma receita neste mês'} />
      <Tile label="Despesas do mês" cents={d.kpis.expensesCents}
        note={`${plural(accounts, 'conta', 'contas')} · ${plural(invoices, 'fatura', 'faturas')}`} />
      <Tile label="Falta pagar" cents={d.kpis.pendingCents}
        note={open ? `${plural(open, 'conta em aberto', 'contas em aberto')}` : 'Tudo pago'} />
      <Tile hero label="Sobra prevista" cents={d.kpis.surplusCents} note={`${d.kpis.surplusPct}% da renda`} />
    </div>
  );
}
