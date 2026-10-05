/**
 * Layout — общий каркас приложения: липкая шапка с навигацией,
 * контейнер контента и подвал. Используется всеми страницами.
 */
import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/monitor', label: 'Обзор', end: true },
  { to: '/inventory', label: 'Клиенты' },
  { to: '/monitor/assets', label: 'Инвентаризация' },
  { to: '/alerts', label: 'Инциденты' },
  { to: '/monitor/agent', label: 'Агент' },
  { to: '/portal', label: 'Портал' },
];

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-cyber-bg text-slate-200">
      <header className="sticky top-0 z-40 border-b border-cyber-border/80 bg-cyber-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <NavLink to="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-500 shadow-glow">
              <span className="h-3 w-3 rounded-full bg-slate-950/80 animate-pulse-soft" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-white">
              Монитор
            </span>
          </NavLink>

          <nav className="flex items-center gap-1 rounded-xl border border-cyber-border bg-cyber-panel/70 p-1">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-cyan-400/15 text-cyan-300'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>

      <footer className="border-t border-cyber-border/60 px-6 py-4 text-center text-xs text-slate-600">
        Система мониторинга локальной сети · данные обновляются автоматически
      </footer>
    </div>
  );
}
