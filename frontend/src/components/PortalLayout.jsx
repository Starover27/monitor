/**
 * PortalLayout — светлый корпоративный каркас портала сотрудника.
 * Тёмная полоса бренда сверху, белая шапка с красным акцентом, боковое меню.
 * Мониторинг и админ-панель видны только администраторам ИТ.
 */
import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { getAuth, clearAuth, authFetch, setAuth } from '../lib/portal-auth';
import { API_BASE } from '../lib/api';
import SidePanel from './SidePanel';
import { useUISettings } from '../pages/PortalHome';

const DEFAULT_NAV = [
  { to: '/portal', label: 'Главная', icon: '🏠', end: true },
  { to: '/helpdesk', label: 'IT-поддержка', icon: '🛠' },
  { to: '/phones', label: 'Телефонная книга', icon: '📞' },
  { to: '/helpdesk/admin', label: 'Заявки (админ)', icon: '🗂', admin_only: true },
  { to: '/portal/admin', label: 'Админ-панель', icon: '⚙️', admin_only: true },
  { to: '/monitor', label: 'Мониторинг ИТ', icon: '📡', admin_only: true },
];

export default function PortalLayout({ children }) {
  const navigate = useNavigate();
  const auth = getAuth();
  const user = auth?.user;
  // Эффективный админ: по роли ИЛИ по индивидуальным правам (галочка «Админ-панель»)
  const visibleSet = Array.isArray(user?.visible_sections) ? user.visible_sections : null;
  const isAdmin = user?.role === 'admin' || (visibleSet ? visibleSet.includes('/portal/admin') : false);
  const [navItems, setNavItems] = useState(() =>
    DEFAULT_NAV.filter((it) => !it.admin_only || isAdmin).map(({ to, label, icon, end }) => ({ to, label, icon, end })),
  );

  // разделы меню загружаются с сервера (управляются в админ-панели)
  // + применяются индивидуальные права пользователя (visible_sections)
  const [userOverrides, setUserOverrides] = useState({}); // {full_name, visible_sections}
  // Настройки внешнего вида — один общий кэшированный запрос (см. PortalHome.useUISettings)
  const ui = useUISettings();
  useEffect(() => {
    authFetch(`${API_BASE}/api/auth/me`)
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (me) {
          setUserOverrides(me);
          // синхронизируем localStorage, чтобы RequireAuth видел свежие права
          const auth = getAuth();
          if (auth) {
            setAuth({ ...auth, user: { ...auth.user, ...me } });
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    authFetch(`${API_BASE}/api/admin/sections`)
      .then((r) => (r.ok ? r.json() : null))
      .then((secs) => {
        if (!alive || !Array.isArray(secs) || secs.length === 0) return;
        const visible = userOverrides.visible_sections; // null/undefined = по умолчанию
        const allowed = (s) => {
          if (!s.enabled) return false;
          if (s.admin_only && !isAdmin) return false;
          if (visible && !visible.includes(s.path)) return false;
          return true;
        };
        const items = secs
          .filter(allowed)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => ({ to: s.path, label: s.label, icon: s.icon || '🔗' }));
        if (items.length) setNavItems(items);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [isAdmin, JSON.stringify(userOverrides.visible_sections || null)]);

  const initials = (user?.full_name || user?.username || '?')
    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const logout = () => {
    clearAuth();
    navigate('/');
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f5f7] [color-scheme:light]">
      {/* Тёмная брендированная полоса */}
      <div className="bg-[#2b3a4b] px-4 py-1.5 sm:px-8">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between text-sm text-white/70">
          <span>Единый портал организации</span>
          <span>{new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>

      {/* Шапка */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-4 px-4 sm:px-8">
          <NavLink to="/portal" className="flex items-center gap-3">
            <img src={ui.LOGO_PATH || '/logo.png'} alt="Логотип" className="h-10 w-auto rounded-lg bg-white p-0.5 shadow-sm" />
            <div className="leading-tight">
              <p className="text-lg font-bold tracking-wide text-[#2b3a4b]">ПОРТАЛ</p>
              <p className="text-xs text-slate-500">сотрудника организации</p>
            </div>
          </NavLink>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-base font-bold text-[#1f2937]">
                {userOverrides.full_name || user?.full_name || user?.username}
              </p>
                <p className="text-sm text-slate-500">
                {userOverrides.department || user?.department || (isAdmin ? 'ИТ-отдел' : 'Сотрудник')}
                {(userOverrides.position || user?.position) ? ` · ${userOverrides.position || user.position}` : ''}
              </p>
            </div>
            <ProfileBadge user={user} isAdmin={isAdmin} initials={initials} />
            <button
            onClick={logout}
            className="portal-btn rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
              title="Выйти"
            >
              Выход
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 py-6 sm:px-8 xl:flex-row">
        {/* Боковое меню */}
        <aside className="lg:w-60 xl:w-56 xl:shrink-0">
          <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm lg:sticky lg:top-24 lg:flex-col">
            {navItems.map(({ to, label, icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end !== undefined ? end : true}
                className={({ isActive }) =>
                  `nav-link flex shrink-0 items-center gap-3 px-4 py-3 text-[15px] font-semibold ${
                    isActive
                      ? 'bg-[#e63a2e] text-white shadow-[0_6px_14px_-6px_rgba(230,58,46,0.6)]'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-[#2b3a4b] hover:translate-x-0.5'
                  }`
                }
              >
                <span className="text-base">{icon}</span>
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Контент */}
        <main className="min-w-0 flex-1 pb-10">
          {children}
        </main>

        {/* Правая колонка: календарь + сообщения (только на портале) */}
        <div className="xl:w-80 xl:shrink-0">
          <SidePanel />
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white px-6 py-4 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} Портал сотрудника организации · техподдержка: admin@kst27.ru
      </footer>
    </div>
  );
}

/** Бейдж-меню профиля: данные доменной учётной записи */
function ProfileBadge({ user, isAdmin, initials }) {
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const rows = [
    ['Доменный логин', user.username],
    ['ФИО', user.full_name],
    ['Отдел', user.department || (isAdmin ? 'ИТ-отдел' : '—')],
    ['Должность', user.position || '—'],
    ['Дата рождения', user.birth_date || '—'],
    ['E-mail', user.email || '—'],
    ['Роль', isAdmin ? 'Администратор ИТ' : 'Сотрудник'],
  ];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2b3a4b] text-sm font-bold text-white transition-transform hover:scale-110 hover:ring-2 hover:ring-[#e63a2e]/30"
        title="Профиль"
      >
        {initials}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-20 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
            <p className="mb-3 border-b border-slate-100 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Доменная учётная запись
            </p>
            <dl className="space-y-1.5 text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-slate-400">{label}</dt>
                  <dd className="truncate text-right font-medium text-[#1f2937]" title={String(value)}>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}
    </div>
  );
}
