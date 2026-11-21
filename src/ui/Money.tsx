import { formatBRL } from '../domain/money';

export default function Money({ cents, symbol = false }: { cents: number; symbol?: boolean }) {
  return <span className="tabular-nums">{formatBRL(cents, { symbol })}</span>;
}
