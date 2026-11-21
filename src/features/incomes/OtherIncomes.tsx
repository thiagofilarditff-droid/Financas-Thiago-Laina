import { useState } from 'react';
import type { Income, Month, Snapshot } from '../../domain/types';
import { incomeFor } from '../../domain/incomes';
import { addMonths, monthLabel } from '../../domain/month';
import { formatBRL, parseBRL } from '../../domain/money';
import Money from '../../ui/Money';
import { endIncome, setIncomeOverride, upsertIncome, useWrite } from '../../data/mutations';
import { useHouseholdId } from '../../data/auth';

const input = 'rounded-inner border border-line bg-card px-2 py-1 outline-none focus:border-accent';

function IncomeForm({ snapshot, month, initial, onDone }: {
  snapshot: Snapshot; month: Month; initial: Income | null; onDone(): void;
}) {
  const householdId = useHouseholdId();
  const save = useWrite((i: Omit<Income, 'id'> & { id?: string }) => upsertIncome(householdId, i));
  const [name, setName] = useState(initial?.name ?? '');
  const [personId, setPersonId] = useState(initial?.personId ?? '');
  const [gross, setGross] = useState(initial?.grossCents != null ? formatBRL(initial.grossCents) : '');
  const [discount, setDiscount] = useState(initial?.discountCents != null ? formatBRL(initial.discountCents) : '');
  const [label, setLabel] = useState(initial?.discountLabel ?? 'Desconto');
  const [net, setNet] = useState<string | null>(initial ? formatBRL(initial.defaultCents) : null);
  const [problem, setProblem] = useState<string | null>(null);

  const grossC = parseBRL(gross);
  const discC = discount.trim() === '' ? 0 : parseBRL(discount);
  const autoNet = grossC !== null && discC !== null ? formatBRL(grossC - discC) : '';
  const netText = net ?? autoNet;

  function submit() {
    const netC = parseBRL(netText);
    if (!name.trim() || netC === null || (gross.trim() !== '' && grossC === null) || discC === null) {
      setProblem('Informe o nome e valores válidos (ex.: 1.234,56).');
      return;
    }
    setProblem(null);
    save.mutate(
      {
        ...(initial ? { id: initial.id } : {}),
        name: name.trim(), personId: personId || null,
        grossCents: grossC, discountCents: gross.trim() === '' ? null : discC, discountLabel: label.trim() || null,
        defaultCents: netC, startMonth: initial?.startMonth ?? month, endMonth: initial?.endMonth ?? null,
        overrides: initial?.overrides ?? {},
      },
      { onSuccess: onDone },
    );
  }

  return (
    <div className="mt-4 grid grid-cols-3 gap-3 rounded-inner bg-accent-soft p-4">
      <label className="text-sm font-semibold">Nome
        <input className={`${input} mt-1 w-full`} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="text-sm font-semibold">Pessoa
        <select className={`${input} mt-1 w-full`} value={personId} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">Casa (ambos)</option>
          {snapshot.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
      <label className="text-sm font-semibold">Bruto
        <input className={`${input} mt-1 w-full`} value={gross} onChange={(e) => setGross(e.target.value)} /></label>
      <label className="text-sm font-semibold">Desconto
        <input className={`${input} mt-1 w-full`} value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
      <label className="text-sm font-semibold">Rótulo do desconto
        <input className={`${input} mt-1 w-full`} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
      <label className="text-sm font-semibold">Líquido
        <input className={`${input} mt-1 w-full`} value={netText} onChange={(e) => setNet(e.target.value)} /></label>
      {(problem || save.error) && (
        <p role="alert" className="col-span-3 text-sm font-semibold text-warn">{problem ?? (save.error as Error).message}</p>
      )}
      <div className="col-span-3 flex justify-end gap-3">
        <button type="button" onClick={onDone} className="rounded-inner border border-line bg-card px-4 py-1.5 font-bold">Cancelar</button>
        <button type="button" onClick={submit} disabled={save.isPending}
          className="rounded-inner bg-accent px-4 py-1.5 font-bold text-white disabled:opacity-60">Salvar receita</button>
      </div>
    </div>
  );
}

function IncomeRow({ income, month, onEdit }: { income: Income; month: Month; onEdit(): void }) {
  const householdId = useHouseholdId();
  const override = useWrite((v: number | null) => setIncomeOverride(householdId, income.id, month, v));
  const end = useWrite(() => endIncome(income.id, addMonths(month, -1)));
  const [value, setValue] = useState('');
  const cents = incomeFor(income, month) ?? 0;
  const overridden = income.overrides[month] !== undefined;
  const parsed = parseBRL(value);
  const error = (override.error ?? end.error) as Error | null;

  return (
    <li className="border-b border-line py-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-bold">{income.name}</div>
          <div className="text-sm text-muted">
            {income.grossCents !== null && <>Bruto <Money cents={income.grossCents} symbol /> · </>}
            {income.discountCents !== null && <>{income.discountLabel ?? 'Desconto'} - <Money cents={income.discountCents} symbol /> · </>}
            desde {monthLabel(income.startMonth)}
            {overridden && ' · valor ajustado neste mês'}
          </div>
        </div>
        <div className="text-lg font-extrabold text-accent"><Money cents={cents} symbol /></div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <input className={`${input} w-32 text-right`} aria-label={`Valor de ${income.name} em ${monthLabel(month)}`}
          placeholder="Só neste mês" value={value} onChange={(e) => setValue(e.target.value)} />
        <button type="button" disabled={parsed === null} onClick={() => override.mutate(parsed, { onSuccess: () => setValue('') })}
          className="font-bold text-accent disabled:opacity-40">Ajustar mês</button>
        {overridden && (
          <button type="button" onClick={() => override.mutate(null)} className="font-bold text-muted">Voltar ao padrão</button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={onEdit} className="font-bold text-accent">Editar</button>
        <button type="button" onClick={() => end.mutate()} className="font-bold text-warn"
          title={`Encerra a receita antes de ${monthLabel(month)}; meses anteriores não mudam`}>Encerrar</button>
      </div>
      {error && <p role="alert" className="mt-1 text-sm font-semibold text-warn">{error.message}</p>}
    </li>
  );
}

export default function OtherIncomes({ snapshot, month }: { snapshot: Snapshot; month: Month }) {
  const [editing, setEditing] = useState<Income | 'new' | null>(null);
  const active = snapshot.incomes.filter((i) => incomeFor(i, month) !== null);
  return (
    <section className="rounded-card border border-line bg-card p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-extrabold">Outras receitas</h2>
        {!editing && (
          <button type="button" onClick={() => setEditing('new')} className="font-bold text-accent">+ Adicionar outra receita</button>
        )}
      </div>
      {active.length === 0 && <p className="text-muted">Nenhuma outra receita em {monthLabel(month)}.</p>}
      <ul>
        {active.map((i) => <IncomeRow key={i.id} income={i} month={month} onEdit={() => setEditing(i)} />)}
      </ul>
      {editing && (
        <IncomeForm key={editing === 'new' ? 'new' : editing.id} snapshot={snapshot} month={month}
          initial={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
      )}
    </section>
  );
}
