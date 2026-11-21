import { useState } from 'react';
import type { Expense, Month } from '../../domain/types';
import { formatBRL, parseBRL } from '../../domain/money';
import MonthPicker from '../../ui/MonthPicker';

export type ExpenseDraft = Omit<Expense, 'id'> & { id?: string };

interface Props {
  categories: string[];
  cards: { id: string; name: string }[];
  people: { id: string; name: string }[];
  month: Month;
  initial: Expense | null;
  busy?: boolean;
  error?: string | null;
  onCancel(): void;
  onSubmit(e: ExpenseDraft): void;
  /** Persists a new category; resolves once it exists. */
  onCreateCategory(name: string): Promise<void>;
}

const input = 'rounded-inner border border-line bg-card px-2 py-1 outline-none focus:border-accent';
const NEW = '__new__';

export default function ExpenseForm({ categories, cards, people, month, initial, busy, error, onCancel, onSubmit, onCreateCategory }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [newCategory, setNewCategory] = useState('');
  const [isFixed, setIsFixed] = useState(initial?.isFixed ?? true);
  const [amount, setAmount] = useState(initial ? formatBRL(initial.defaultCents) : '');
  const [dueDay, setDueDay] = useState(initial?.dueDay != null ? String(initial.dueDay) : '');
  const [method, setMethod] = useState<Expense['paymentMethod']>(initial?.paymentMethod ?? 'cash');
  const [cardId, setCardId] = useState(initial?.cardId ?? '');
  const [payroll, setPayroll] = useState(initial?.payrollDeducted ?? false);
  const [personId, setPersonId] = useState(initial?.personId ?? '');
  const [startMonth, setStartMonth] = useState<Month>(initial?.startMonth ?? month);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [catBusy, setCatBusy] = useState(false);

  const isCard = method === 'card';
  const categoryOptions = category && !categories.includes(category) && category !== NEW ? [...categories, category] : categories;

  async function addCategory() {
    const n = newCategory.trim();
    if (!n) return;
    setCatBusy(true);
    try {
      if (!categories.includes(n)) await onCreateCategory(n);
      setCategory(n);
      setNewCategory('');
      setProblem(null);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setCatBusy(false);
    }
  }

  function submit() {
    const cents = parseBRL(amount);
    const day = dueDay.trim() === '' ? null : Number(dueDay);
    if (!name.trim() || !category || category === NEW || cents === null || cents < 0) {
      setProblem('Informe nome, categoria e um valor válido (ex.: 1.234,56).');
      return;
    }
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) {
      setProblem('O dia de vencimento deve estar entre 1 e 31.');
      return;
    }
    if (isCard && !cardId) {
      setProblem('Escolha o cartão.');
      return;
    }
    if (!isCard && payroll && !personId) {
      setProblem('Escolha de qual contracheque a despesa é descontada.');
      return;
    }
    setProblem(null);
    const deducted = !isCard && payroll;
    onSubmit({
      ...(initial ? { id: initial.id } : {}),
      name: name.trim(), category, isFixed, defaultCents: cents, dueDay: day,
      payrollDeducted: deducted, personId: deducted ? personId : null,
      paymentMethod: method, cardId: isCard ? cardId : null,
      startMonth, endMonth: initial?.endMonth ?? null, notes: notes.trim() || null,
    });
  }

  const shown = problem ?? error;
  return (
    <div className="grid grid-cols-3 gap-3 rounded-inner bg-accent-soft p-4">
      <label className="text-sm font-semibold">Nome
        <input className={`${input} mt-1 w-full`} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div className="text-sm font-semibold">
        <label>Categoria
          <select className={`${input} mt-1 w-full`} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Selecione…</option>
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value={NEW}>Nova categoria…</option>
          </select></label>
        {category === NEW && (
          <div className="mt-1 flex gap-2">
            <input className={`${input} w-full`} aria-label="Nome da nova categoria" value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)} />
            <button type="button" onClick={addCategory} disabled={catBusy || !newCategory.trim()}
              className="font-bold text-accent disabled:opacity-40">Adicionar</button>
          </div>
        )}
      </div>
      <label className="text-sm font-semibold">Valor padrão
        <input className={`${input} mt-1 w-full`} value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} /></label>
      <label className="text-sm font-semibold">Dia de vencimento
        <input className={`${input} mt-1 w-full`} value={dueDay} inputMode="numeric" onChange={(e) => setDueDay(e.target.value)} /></label>
      <div className="text-sm font-semibold">
        <label>Forma de pagamento
          <select className={`${input} mt-1 w-full`} value={method}
            onChange={(e) => setMethod(e.target.value as Expense['paymentMethod'])}>
            <option value="cash">À vista</option>
            <option value="card" disabled={cards.length === 0}>Cartão</option>
          </select></label>
        {cards.length === 0 && <p className="mt-1 font-normal text-muted">Cadastre um cartão em Cartões primeiro.</p>}
      </div>
      {isCard ? (
        <label className="text-sm font-semibold">Cartão
          <select required className={`${input} mt-1 w-full`} value={cardId} onChange={(e) => setCardId(e.target.value)}>
            <option value="">Selecione…</option>
            {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
      ) : (
        <div className="text-sm font-semibold">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={payroll} onChange={(e) => setPayroll(e.target.checked)} />Descontada em folha</label>
          {payroll && (
            <label className="mt-1 block">De qual contracheque
              <select className={`${input} mt-1 w-full`} value={personId} onChange={(e) => setPersonId(e.target.value)}>
                <option value="">Selecione…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></label>
          )}
        </div>
      )}
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={isFixed} onChange={(e) => setIsFixed(e.target.checked)} />Repete todo mês</label>
      <div className="text-sm font-semibold">Começa em
        <div className="mt-1"><MonthPicker value={startMonth} onChange={setStartMonth} /></div></div>
      <label className="text-sm font-semibold">Observações
        <input className={`${input} mt-1 w-full`} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      {shown && <p role="alert" className="col-span-3 text-sm font-semibold text-warn">{shown}</p>}
      <div className="col-span-3 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="rounded-inner border border-line bg-card px-4 py-1.5 font-bold">Cancelar</button>
        <button type="button" onClick={submit} disabled={busy}
          className="rounded-inner bg-accent px-4 py-1.5 font-bold text-white disabled:opacity-60">Salvar despesa</button>
      </div>
    </div>
  );
}
