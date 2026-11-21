import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: 'Painel', end: true },
  { to: '/mes-a-mes', label: 'Mês a mês' },
  { to: '/receitas', label: 'Receitas e contracheques' },
  { to: '/despesas', label: 'Despesas' },
  { to: '/cartoes', label: 'Cartões' },
];

export default function Sidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-6 border-r border-line bg-card p-5">
      <div>
        <div className="text-lg font-extrabold text-fg">Orçamento da Casa</div>
        <div className="text-sm text-muted">Thiago &amp; Laina</div>
      </div>
      <nav className="flex flex-col gap-1">
        {items.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `rounded-inner px-3 py-2 text-sm font-semibold ${
                isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:text-fg'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
