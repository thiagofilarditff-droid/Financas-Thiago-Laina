import { useState } from 'react';
import type { Card, InstallmentPlan, Month, Snapshot } from '../../domain/types';
import { compareMonth, monthLabel } from '../../domain/month';
import { installmentDueMonth } from '../../domain/installments';
import { deletePlan, useWrite } from '../../data/mutations';
import Money from '../../ui/Money';

function PlanRow({ plan, today }: { plan: InstallmentPlan; today: Month }) {
  const [confirm, setConfirm] = useState(false);
  const remove = useWrite(() => deletePlan(plan.id));
  const last = installmentDueMonth(plan, plan.totalInstallments);
  const left = Array.from({ length: plan.totalInstallments }, (_, k) => installmentDueMonth(plan, k + 1))
    .filter((m) => compareMonth(m, today) >= 0).length;
  return (
    <li className="border-b border-line py-2">
      <div className="flex items-center gap-4 text-sm">
        <div className="flex-1 font-bold">{plan.description}</div>
        <div className="text-muted">{plan.totalInstallments}× <Money cents={plan.installmentCents} symbol /></div>
        <div className="w-44 text-muted">{monthLabel(plan.firstDueMonth)} a {monthLabel(last)}</div>
        <div className="w-28 text-muted">faltam {left} de {plan.totalInstallments}</div>
        {confirm ? (
          <span className="flex gap-2">
            <button type="button" disabled={remove.isPending} onClick={() => remove.mutate()}
              title="As parcelas desta compra deixam de ser previstas; faturas já salvas não mudam"
              className="font-bold text-warn">Confirmar exclusão?</button>
            <button type="button" onClick={() => setConfirm(false)} className="font-bold text-muted">Cancelar</button>
          </span>
        ) : (
          <button type="button" onClick={() => { remove.reset(); setConfirm(true); }} className="font-bold text-warn">Excluir</button>
        )}
      </div>
      {remove.error && <p role="alert" className="text-sm font-semibold text-warn">{(remove.error as Error).message}</p>}
    </li>
  );
}

/** Installment purchases of one card that still have installments from `today` on, so a wrong one can be deleted. */
export default function CardPlans({ card, snapshot, today }: { card: Card; snapshot: Snapshot; today: Month }) {
  const plans = snapshot.plans
    .filter((p) => p.cardId === card.id && compareMonth(installmentDueMonth(p, p.totalInstallments), today) >= 0)
    .sort((a, b) => compareMonth(a.firstDueMonth, b.firstDueMonth) || a.description.localeCompare(b.description));
  if (plans.length === 0) return <p className="text-sm text-muted">Nenhuma compra parcelada em andamento.</p>;
  return <ul>{plans.map((p) => <PlanRow key={p.id} plan={p} today={today} />)}</ul>;
}
