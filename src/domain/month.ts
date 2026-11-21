import type { Month } from './types';

const LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const pad = (n: number) => String(n).padStart(2, '0');

function parts(m: Month): [number, number] {
  const [y, mo] = m.split('-').map(Number);
  return [y, mo];
}

function fromIndex(idx: number): Month {
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function toMonth(d: Date | string): Month {
  if (typeof d === 'string') return d.slice(0, 7);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function addMonths(m: Month, n: number): Month {
  const [y, mo] = parts(m);
  return fromIndex(y * 12 + (mo - 1) + n);
}

export function monthsOfYear(year: number): Month[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
}

export function compareMonth(a: Month, b: Month): number {
  const [ya, ma] = parts(a);
  const [yb, mb] = parts(b);
  return ya * 12 + ma - (yb * 12 + mb);
}

export function monthLabel(m: Month): string {
  const [y, mo] = parts(m);
  return `${LABELS[mo - 1]}/${y}`;
}

export function monthShort(m: Month): string {
  return LABELS[parts(m)[1] - 1].toUpperCase();
}

const NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function monthName(m: Month): string {
  return NAMES[parts(m)[1] - 1];
}

export function dueDateFor(m: Month, day: number): string {
  const [y, mo] = parts(m);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const last = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return `${y}-${pad(mo)}-${pad(Math.min(day, last))}`;
}

export function currentMonth(): Month {
  return toMonth(new Date());
}
