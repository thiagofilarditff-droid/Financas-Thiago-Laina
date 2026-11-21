import type { DashboardCard } from '../../domain/dashboard';
import type { Month } from '../../domain/types';
import { monthLabel, monthName } from '../../domain/month';
import { formatBRL } from '../../domain/money';

function CardTile({ card: c }: { card: DashboardCard }) {
  const pct = c.limitCents > 0 ? Math.min(100, Math.round((c.limitUsedCents / c.limitCents) * 100)) : 0;
  return (
    <div className="grid gap-1.5 rounded-inner border border-line bg-bg px-3.5 py-3">
      <div className="flex justify-between text-[0.84rem] font-semibold">
        <span>{c.holderName ? `${c.name} · ${c.holderName}` : c.name}</span>
        <span className="tabular-nums">{formatBRL(c.invoiceCents, { symbol: true })}</span>
      </div>
      {c.limitCents > 0 && (
        <div className="h-[7px] overflow-hidden rounded-full bg-line" role="progressbar" aria-label={`Limite usado do ${c.name}`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <i className="block h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} />
        </div>
      )}
      <div className="flex justify-between text-[0.75rem] text-muted">
        <span>
          {c.limitCents > 0
            ? `Limite usado ${formatBRL(c.limitUsedCents)} de ${formatBRL(c.limitCents)}`
            : 'Sem limite cadastrado'}
        </span>
        {c.openPlans > 0 && <span>{c.openPlans} {c.openPlans === 1 ? 'compra parcelada' : 'compras parceladas'}</span>}
      </div>
      {c.futureInstallmentsCents > 0 && c.lastProjectedMonth && (
        <div className="text-[0.75rem] text-muted">
          Parcelas futuras já previstas: {formatBRL(c.futureInstallmentsCents, { symbol: true })} até {monthLabel(c.lastProjectedMonth)}
        </div>
      )}
    </div>
  );
}

export default function CardsSummary({ cards, month }: { cards: DashboardCard[]; month: Month }) {
  return (
    <section className="min-w-0 rounded-card border border-line bg-card px-[18px] py-4">
      <h2 className="mb-2.5 flex justify-between text-[0.95rem] font-bold">
        Cartões
        <small className="text-sm font-normal text-muted">fatura que vence em {monthName(month).toLowerCase()}</small>
      </h2>
      {cards.length === 0 ? <p className="text-sm text-muted">Nenhum cartão cadastrado ainda.</p> : (
        <div className="grid gap-3">{cards.map((c) => <CardTile key={c.cardId} card={c} />)}</div>
      )}
    </section>
  );
}
