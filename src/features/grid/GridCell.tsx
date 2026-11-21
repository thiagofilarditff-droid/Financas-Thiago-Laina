import { useState } from 'react';
import type { GridCell as Cell } from '../../domain/grid';
import { formatBRL, parseBRL } from '../../domain/money';

const STATE_LABEL = { paid: 'pago', pending: 'pendente', projected: 'previsto', none: '' } as const;

interface Props {
  cell: Cell;
  kind: 'income' | 'expense' | 'card';
  /** "Condomínio SQS 214, NOV" — the row and month the cell sits in. */
  label: string;
  /** Payroll-deducted expenses are always paid and never toggle. */
  locked?: boolean;
  onTogglePaid?(): void;
  /** Opens Cartões for a projected card cell. */
  onOpenCard?(): void;
  /** Saves a new amount for the month (expense cells only). */
  onEdit?(cents: number): void;
}

export default function GridCell({ cell, kind, label, locked = false, onTogglePaid, onOpenCard, onEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);

  if (cell.state === 'none') return <span className="text-muted">–</span>;
  const amount = formatBRL(cell.cents);
  if (kind === 'income') return <span className="tabular-nums">{amount}</span>;

  const aria = `${label}, ${STATE_LABEL[cell.state]}, ${amount}`;
  const base = 'rounded-inner px-2 py-1 tabular-nums';

  let main;
  if (cell.state === 'projected') {
    main = (
      <button type="button" title="Previsto" aria-label={aria} onClick={onOpenCard} className={`${base} italic text-muted hover:bg-accent-soft`}>
        {amount}
      </button>
    );
  } else if (cell.state === 'paid' && locked) {
    main = <span className={`${base} font-semibold text-good`} title="Descontado em folha">✓ {amount}</span>;
  } else if (cell.state === 'paid') {
    main = (
      <button type="button" aria-label={aria} onClick={onTogglePaid} className={`${base} font-semibold text-good hover:bg-accent-soft`}>
        ✓ {amount}
      </button>
    );
  } else {
    main = (
      <button type="button" aria-label={aria} onClick={onTogglePaid} className={`${base} text-muted hover:bg-accent-soft`}>
        {amount}
      </button>
    );
  }

  const canEdit = !!onEdit && kind === 'expense' && !locked;
  if (editing) {
    const submit = () => {
      const cents = parseBRL(text);
      if (cents === null) { setInvalid(true); return; }
      onEdit!(cents);
      setEditing(false);
    };
    return (
      <input autoFocus aria-label={`Novo valor de ${label}`} aria-invalid={invalid} value={text} inputMode="decimal"
        onChange={(e) => { setText(e.target.value); setInvalid(false); }}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setEditing(false); }}
        onBlur={() => setEditing(false)}
        className={`w-24 rounded-inner border bg-card px-2 py-1 text-right tabular-nums ${invalid ? 'border-warn' : 'border-line'}`} />
    );
  }

  return (
    <span className="group relative inline-flex items-center">
      {main}
      {canEdit && (
        <button type="button" aria-label={`Editar valor de ${label}`} title="Editar valor"
          onClick={() => { setText(formatBRL(cell.cents)); setInvalid(false); setEditing(true); }}
          className="ml-1 text-xs font-bold text-accent opacity-0 focus:opacity-100 group-hover:opacity-100">
          editar valor
        </button>
      )}
    </span>
  );
}
