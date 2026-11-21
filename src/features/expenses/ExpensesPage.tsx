import { useState } from 'react';
import { currentMonth, addMonths, compareMonth, monthLabel } from '../../domain/month';
import { isActiveIn } from '../../domain/expenses';
import type { Expense, Month, Snapshot } from '../../domain/types';
import { useSnapshot } from '../../data/snapshot';
import { useHouseholdId } from '../../data/auth';
import { addCategory, deleteExpense, endExpense, upsertExpense, useWrite } from '../../data/mutations';
import MonthPicker from '../../ui/MonthPicker';
import Money from '../../ui/Money';
import ExpenseForm, { type ExpenseDraft } from './ExpenseForm';

const badge = 'rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent';

function ExpenseRow({ expense, snapshot, month, onEdit }: { expense: Expense; snapshot: Snapshot; month: Month; onEdit(): void }) {
  const end = useWrite(() => endExpense(expense.id, addMonths(month, -1)));
  const del = useWrite(() => deleteExpense(expense.id));
  const [confirm, setConfirm] = useState<'end' | 'delete' | null>(null);
  const hasEntries = snapshot.entries.some((e) => e.expenseId === expense.id);
  const canEnd = compareMonth(addMonths(month, -1), expense.startMonth) >= 0;
  const card = snapshot.cards.find((c) => c.id === expense.cardId);
  const error = (end.error ?? del.error) as Error | null;

  return (
    <li className="border-b border-line py-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-bold">
            {expense.name}
            {expense.isFixed && <span className={badge}>Fixa</span>}
            {expense.payrollDeducted && <span className={badge}>Em folha</span>}
            {card && <span className={badge}>Cartão {card.name}</span>}
          </div>
          <div className="text-sm text-muted">
            {expense.dueDay !== null && <>vence dia {expense.dueDay} · </>}desde {monthLabel(expense.startMonth)}
            {expense.endMonth && <> · até {monthLabel(expense.endMonth)}</>}
          </div>
        </div>
        <div className="text-lg font-extrabold text-accent"><Money cents={expense.defaultCents} symbol /></div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-3 text-sm">
        <button type="button" onClick={onEdit} className="font-bold text-accent">Editar</button>
        {confirm ? (
          <>
            <button type="button" className="font-bold text-warn"
              onClick={() => (confirm === 'end' ? end : del).mutate(undefined, { onSuccess: () => setConfirm(null) })}>
              {confirm === 'end' ? 'Confirmar encerramento?' : 'Confirmar exclusão?'}
            </button>
            <button type="button" onClick={() => setConfirm(null)} className="font-bold text-muted">Cancelar</button>
          </>
        ) : (
          <>
            <button type="button" disabled={!canEnd} onClick={() => setConfirm('end')} className="font-bold text-warn disabled:opacity-40"
              title={`Encerra a despesa antes de ${monthLabel(month)}; meses anteriores não mudam`}>Encerrar</button>
            {!hasEntries && <button type="button" onClick={() => setConfirm('delete')} className="font-bold text-warn">Excluir</button>}
          </>
        )}
      </div>
      {error && <p role="alert" className="mt-1 text-sm font-semibold text-warn">{error.message}</p>}
    </li>
  );
}

export default function ExpensesPage() {
  const householdId = useHouseholdId();
  const { data: snapshot, isLoading, error } = useSnapshot();
  const [month, setMonth] = useState<Month>(currentMonth());
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const save = useWrite((e: ExpenseDraft) => upsertExpense(householdId, e));
  const newCategory = useWrite((name: string) => addCategory(householdId, name));

  if (isLoading) return <p className="text-muted">Carregando…</p>;
  if (error || !snapshot) return <p role="alert" className="font-semibold text-warn">Não consegui carregar os dados.</p>;

  const active = snapshot.expenses.filter((e) => isActiveIn(e, month));
  const groups = [...new Set(active.map((e) => e.category))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Despesas</h1>
        <MonthPicker value={month} onChange={setMonth} />
      </div>
      <section className="rounded-card border border-line bg-card p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">Despesas em {monthLabel(month)}</h2>
          {!editing && <button type="button" onClick={() => setEditing('new')} className="font-bold text-accent">+ Adicionar despesa</button>}
        </div>
        {active.length === 0 && <p className="text-muted">Nenhuma despesa em {monthLabel(month)}.</p>}
        {groups.map((g) => (
          <div key={g} className="mt-3">
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-muted">{g}</h3>
            <ul>
              {active.filter((e) => e.category === g).map((e) => (
                <ExpenseRow key={e.id} expense={e} snapshot={snapshot} month={month} onEdit={() => { save.reset(); setEditing(e); }} />
              ))}
            </ul>
          </div>
        ))}
        {editing && (
          <div className="mt-4">
            <ExpenseForm
              key={editing === 'new' ? 'new' : editing.id}
              categories={snapshot.categories}
              cards={snapshot.cards.filter((c) => !c.archived || (editing !== 'new' && editing.cardId === c.id))}
              people={snapshot.people}
              month={month}
              initial={editing === 'new' ? null : editing}
              busy={save.isPending}
              error={save.error ? (save.error as Error).message : null}
              onCancel={() => { save.reset(); setEditing(null); }}
              onCreateCategory={(name) => newCategory.mutateAsync(name)}
              onSubmit={(e) => save.mutate(e, { onSuccess: () => setEditing(null) })}
            />
          </div>
        )}
      </section>
    </div>
  );
}
