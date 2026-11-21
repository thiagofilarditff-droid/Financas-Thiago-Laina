import type { Month } from '../domain/types';
import { addMonths, monthLabel } from '../domain/month';

export default function MonthPicker({ value, onChange }: { value: Month; onChange(m: Month): void }) {
  const btn = 'rounded-inner border border-line bg-card px-3 py-1 font-bold text-accent';
  return (
    <div className="inline-flex items-center gap-2">
      <button type="button" className={btn} aria-label="Mês anterior" onClick={() => onChange(addMonths(value, -1))}>‹</button>
      <span className="min-w-24 text-center font-bold" aria-live="polite">{monthLabel(value)}</span>
      <button type="button" className={btn} aria-label="Próximo mês" onClick={() => onChange(addMonths(value, 1))}>›</button>
    </div>
  );
}
