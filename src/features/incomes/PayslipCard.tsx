import type { Month, Snapshot } from '../../domain/types';
import { payslipFor, payslipTotals, depositedCents } from '../../domain/payslip';
import { payrollDeductionsFor } from '../../domain/expenses';
import { monthLabel } from '../../domain/month';
import Money from '../../ui/Money';

interface Props { snapshot: Snapshot; personId: string; month: Month; onEdit(): void }

export default function PayslipCard({ snapshot, personId, month, onEdit }: Props) {
  const person = snapshot.people.find((p) => p.id === personId);
  const slip = payslipFor(snapshot.payslips, personId, month);
  const header = (
    <div className="mb-4 flex items-start justify-between">
      <div>
        <h2 className="text-lg font-extrabold">{person?.name ?? 'Pessoa'}</h2>
        {slip && <p className="text-sm text-muted">Contracheque válido desde {monthLabel(slip.validFrom)}</p>}
      </div>
      <button type="button" onClick={onEdit} className="rounded-inner border border-line px-3 py-1 text-sm font-bold text-accent">
        {slip ? 'Editar contracheque' : 'Criar contracheque'}
      </button>
    </div>
  );
  if (!slip) {
    return (
      <section className="rounded-card border border-line bg-card p-5">
        {header}
        <p className="text-muted">Nenhum contracheque cadastrado até {monthLabel(month)}.</p>
      </section>
    );
  }
  const { proventosCents, descontosCents, liquidoCents } = payslipTotals(slip);
  const deposited = depositedCents(liquidoCents, payrollDeductionsFor(snapshot, personId, month));
  const lines = (kind: 'provento' | 'desconto') =>
    slip.lines.filter((l) => l.kind === kind).sort((a, b) => a.order - b.order);
  const row = 'flex justify-between gap-4 border-b border-line py-1.5 text-sm';

  return (
    <section className="rounded-card border border-line bg-card p-5">
      {header}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h3 className="mb-2 text-sm font-extrabold uppercase text-muted">Proventos</h3>
          {lines('provento').map((l) => (
            <div key={l.order} className={row}><span>{l.label}</span><Money cents={l.amountCents} /></div>
          ))}
          <div className="mt-2 flex justify-between font-bold">
            <span>Total proventos</span>{' '}<Money cents={proventosCents} symbol />
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-extrabold uppercase text-muted">Descontos</h3>
          {lines('desconto').map((l) => (
            <div key={l.order} className={`${row} text-warn`}>
              <span className="text-fg">{l.label}</span>
              <span className="tabular-nums">-{' '}<Money cents={l.amountCents} /></span>
            </div>
          ))}
          <div className="mt-2 flex justify-between font-bold text-warn">
            <span className="text-fg">Total descontos</span>{' '}<span>-{' '}<Money cents={descontosCents} symbol /></span>
          </div>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between rounded-inner bg-accent-soft px-4 py-3 text-lg font-extrabold text-accent">
        <span>Salário líquido</span>{' '}<Money cents={liquidoCents} symbol />
      </div>
      <p className="mt-2 flex justify-between text-sm text-muted"
        title="Líquido menos descontos opcionais em folha (PNR, planos, etc.)">
        <span>Depositado na conta</span>{' '}<Money cents={deposited} symbol />
      </p>
    </section>
  );
}
