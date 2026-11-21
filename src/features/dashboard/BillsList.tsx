import type { DashboardBill } from '../../domain/dashboard';
import type { Month } from '../../domain/types';
import { monthName } from '../../domain/month';
import { formatBRL } from '../../domain/money';

function detail(b: DashboardBill): string {
  if (b.kind === 'card') return b.sublabel;
  if (!b.canToggle) return `${b.sublabel} · descontado em folha`;
  return b.dueDay ? `${b.sublabel} · vence dia ${b.dueDay}` : b.sublabel;
}

function lockedTitle(b: DashboardBill): string | undefined {
  if (b.canToggle) return undefined;
  return b.kind === 'card' ? 'A fatura deste mês ainda não foi lançada' : 'Descontado em folha';
}

export default function BillsList({ bills, month, onToggle }: {
  bills: DashboardBill[]; month: Month; onToggle(bill: DashboardBill, paid: boolean): void;
}) {
  const paid = bills.filter((b) => b.paid).length;
  return (
    <section className="min-w-0 rounded-card border border-line bg-card px-[18px] py-4">
      <h2 className="mb-2.5 flex justify-between text-[0.95rem] font-bold">
        Contas de {monthName(month).toLowerCase()}
        {bills.length > 0 && <small className="text-sm font-normal text-muted">{paid}/{bills.length} pagas</small>}
      </h2>
      {bills.length === 0 ? <p className="text-sm text-muted">Nenhuma conta neste mês.</p> : (
        <ul className="grid gap-0.5">
          {bills.map((b) => (
            <li key={b.key} className="grid grid-cols-[22px_1fr_auto] items-center gap-2.5 border-b border-line px-1 py-[7px] text-[0.86rem] last:border-b-0">
              <span className="relative grid h-[18px] w-[18px] place-items-center" title={lockedTitle(b)}>
                <input type="checkbox" aria-label={b.label} checked={b.paid} disabled={!b.canToggle}
                  onChange={(e) => onToggle(b, e.target.checked)}
                  className="peer h-[18px] w-[18px] cursor-pointer appearance-none rounded-[5px] border-[1.5px] border-[#b9c8c4] bg-card checked:border-good checked:bg-good disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" />
                <span aria-hidden className="pointer-events-none absolute text-xs text-white opacity-0 peer-checked:opacity-100">✓</span>
              </span>
              <span className={b.paid ? 'text-muted' : ''}>
                {b.label}
                <small className="block text-[0.74rem] text-muted">{detail(b)}</small>
              </span>
              <span className="font-semibold tabular-nums">{formatBRL(b.cents)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
