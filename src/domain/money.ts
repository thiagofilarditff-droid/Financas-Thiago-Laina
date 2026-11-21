import type { Cents } from './types';

const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatBRL(c: Cents, opts: { symbol?: boolean } = {}): string {
  const text = fmt.format(Math.abs(c) / 100).replace(/ /g, ' ');
  const sign = c < 0 ? '-' : '';
  return `${sign}${opts.symbol ? 'R$ ' : ''}${text}`;
}

export function toCents(reais: number): Cents {
  return Math.round(reais * 100);
}

export function fromCents(c: Cents): number {
  return c / 100;
}

/** Parses pt-BR money text ('1.234,56', '-12,30', 'R$ 10') into cents; null if invalid. */
export function parseBRL(s: string): Cents | null {
  const t = s.replace(/R\$/g, '').replace(/\s/g, '');
  if (!/^-?(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(t)) return null;
  const neg = t.startsWith('-');
  const [int, frac = ''] = t.replace('-', '').replace(/\./g, '').split(',');
  const cents = Number(int) * 100 + Number(frac.padEnd(2, '0'));
  return neg ? -cents : cents;
}
