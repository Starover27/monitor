/**
 * Analytics — дашборд метрик портала (только для админов).
 * Использует recharts: BarChart (авторизации, секции), PieChart (роли/новости).
 * Работает и на светлом портале (/portal/analytics), и в тёмном мониторинге
 * (/monitor/analytics): тема определяется по URL.
 */
import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { API_BASE } from '../lib/api';
import { getAuth } from '../lib/portal-auth';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';

const COLORS = ['#34d399', '#fbbf24', '#f87171', '#60a5fa', '#a78bfa', '#f472b6'];

function useDark() {
  const { pathname } = useLocation();
  return pathname.startsWith('/monitor');
}

function TooltipCard({ active, payload, label, dark }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={`rounded-lg px-3 py-2 text-xs shadow-lg ${dark ? 'bg-slate-900 text-slate-200 border border-slate-700' : 'bg-white text-slate-700 border border-slate-200'}`}>
      <div className="opacity-60">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }} className="font-semibold">{p.name}: {p.value}</div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const dark = useDark();
  const auth = getAuth();
  const authHeaders = useMemo(() => {
    const t = auth?.token;
    return t ? { Authorization: `Bearer ${t}` } : undefined;
  }, [auth]);
  const { data, error, loading } = useFetch(`${API_BASE}/api/analytics/dashboard?days=7`, { interval: 60000, headers: authHeaders });
  const [days, setDays] = useState(7);

  const logins = useMemo(() => data?.logins || [], [data]);
  const sections = useMemo(() => data?.sections || [], [data]);
  const users = useMemo(() => data?.users || [], [data]);
  const tickets = data?.tickets ?? 0;
  const newsCreated = data?.news_created ?? 0;
  const newsRead = data?.news_read ?? 0;
  const uniqueUsers = data?.unique_users ?? 0;
  const recentLogins = data?.recent_logins || [];

  const pieData = useMemo(() => [
    { name: 'Заявок IT', value: tickets, color: '#f87171' },
    { name: 'Новостей создано', value: newsCreated, color: '#60a5fa' },
    { name: 'Новостей прочитано', value: newsRead, color: '#34d399' },
  ].filter(d => d.value > 0), [tickets, newsCreated, newsRead]);

  const reload = () => setDays((d) => (d === 7 ? 30 : 7));

  // Тематические классы
  const t = dark
    ? {
        page: 'text-slate-200', title: 'text-white', sub: 'text-slate-500',
        card: 'card p-4', panel: 'card overflow-hidden',
        header: 'border-cyber-border text-slate-300',
        rowBorder: 'divide-cyber-border/50', rowName: 'text-slate-200', rowSub: 'text-slate-500', rowMeta: 'text-slate-400',
        btn: 'rounded-lg border border-cyber-border bg-slate-900 px-4 py-2 text-xs text-slate-300 hover:text-white',
        grid: '#1e2a3d', tick: '#64748b', axis: '#1e2a3d',
      }
    : {
        page: 'text-slate-700', title: 'text-[#1f2937]', sub: 'text-slate-500',
        card: 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm', panel: 'rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm',
        header: 'border-slate-200 text-[#2b3a4b]',
        rowBorder: 'divide-slate-100', rowName: 'text-[#1f2937]', rowSub: 'text-slate-400', rowMeta: 'text-slate-400',
        btn: 'rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50',
        grid: '#e5e7eb', tick: '#6b7280', axis: '#e5e7eb',
      };

  return (
    <div className={`animate-fade-in space-y-6 ${t.page}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-semibold tracking-tight ${t.title}`}>Аналитика</h1>
          <p className={`mt-1 text-sm ${t.sub}`}>Активность пользователей за {days} дней</p>
        </div>
        <button onClick={reload} className={t.btn}>
          Период: {days === 7 ? '7 дней' : '30 дней'}
        </button>
      </div>

      {error && <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-600">Ошибка: {error}</div>}

      {/* Карточки */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Уникальных пользователей', value: uniqueUsers, color: dark ? 'text-emerald-300' : 'text-emerald-600' },
          { label: 'Авторизаций', value: logins.reduce((a, r) => a + r.count, 0), color: dark ? 'text-sky-300' : 'text-sky-600' },
          { label: 'Заявок в IT', value: tickets, color: dark ? 'text-rose-300' : 'text-rose-600' },
          { label: 'Новостей прочитано', value: newsRead, color: dark ? 'text-amber-300' : 'text-amber-600' },
        ].map((s, i) => (
          <div key={i} className={t.card}>
            <div className={`text-xs ${t.sub}`}>{s.label}</div>
            <div className={`mt-1 font-mono text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Графики */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={t.card}>
          <h3 className={`mb-3 text-sm font-semibold ${t.header}`}>Авторизации по дням</h3>
          {loading ? (
            <div className="skeleton h-48 w-full" />
          ) : (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={logins}>
                  <CartesianGrid stroke={t.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: t.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: t.axis }} />
                  <YAxis tick={{ fill: t.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: t.axis }} allowDecimals={false} />
                  <Tooltip content={<TooltipCard dark={dark} />} />
                  <Bar dataKey="count" name="Входы" fill="#34d399" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className={t.card}>
          <h3 className={`mb-3 text-sm font-semibold ${t.header}`}>Популярные разделы</h3>
          {loading ? (
            <div className="skeleton h-48 w-full" />
          ) : (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sections.slice(0, 8)} layout="vertical">
                  <CartesianGrid stroke={t.grid} strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fill: t.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: t.axis }} allowDecimals={false} />
                  <YAxis type="category" dataKey="path" tick={{ fill: t.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: t.axis }} width={120} />
                  <Tooltip content={<TooltipCard dark={dark} />} />
                  <Bar dataKey="count" name="Просмотры" fill="#60a5fa" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className={t.card}>
          <h3 className={`mb-3 text-sm font-semibold ${t.header}`}>Соотношение событий</h3>
          {loading ? (
            <div className="skeleton h-48 w-full" />
          ) : (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label>
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip content={<TooltipCard dark={dark} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className={t.panel}>
          <h3 className={`border-b px-4 py-2.5 text-sm font-semibold ${t.header}`}>Кто и когда авторизовался (последние 30)</h3>
          <div className={`max-h-56 divide-y overflow-y-auto ${t.rowBorder}`}>
            {recentLogins.length === 0 && <div className={`p-4 text-xs ${t.sub}`}>Нет данных</div>}
            {recentLogins.map((l, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
                <span className="min-w-0 truncate">
                  <span className={`font-medium ${t.rowName}`}>{l.full_name}</span>
                  {l.department && <span className={`ml-2 ${t.rowSub}`}>{l.department}</span>}
                </span>
                <span className={`shrink-0 font-mono ${t.rowMeta}`}>
                  {l.at ? new Date(l.at).toLocaleString('ru-RU') : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className={t.panel}>
          <h3 className={`border-b px-4 py-2.5 text-sm font-semibold ${t.header}`}>Топ пользователей</h3>
          <div className={`max-h-48 divide-y overflow-y-auto ${t.rowBorder}`}>
            {users.length === 0 && <div className={`p-4 text-xs ${t.sub}`}>Нет данных</div>}
            {users.map((u, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-2 font-mono text-xs">
                <span className={`truncate ${t.rowName}`}>{u.full_name || u.username}</span>
                <span className={t.rowMeta}>{u.count} событий</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
