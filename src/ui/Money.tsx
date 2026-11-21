const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Money({ cents, symbol = false }: { cents: number; symbol?: boolean }) {
  const text = fmt.format(cents / 100);
  return <span className="tabular-nums">{symbol ? `R$ ${text}` : text}</span>;
}
