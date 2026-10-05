/**
 * Analytics — дашборд метрик портала (только для админов).
 * Использует recharts: BarChart (авторизации, секции), PieChart (роли/новости).
 */
import { useEffect, useMemo, useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { API_BASE } from '../lib/api';
import { getAuth } from '../lib/portal-auth';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';

const COLORS = ['#34d399', '#fbbf24', '#f87171', '#60a5fa', '#a78bfa', '#f472b6'];

function TooltipCard({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs shadow-panel">
      <div className="text-slate-500">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }} className="font-semibold">{p.name}: {p.value}</div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const { data, error, loading } = useFetch(`${API_BASE}/api/analytics/dashboard?days=7`, { interval: 60000 });
  const [days, setDays] = useState(7);

  const logins = useMemo(() => data?.logins || [], [data]);
  const sections = useMemo(() => data?.sections || [], [data]);
  const users = useMemo(() => data?.users || [], [data]);
  const tickets = data?.tickets ?? 0;
  const newsCreated = data?.news_created ?? 0;
  const newsRead = data?.news_read ?? 0;
  const uniqueUsers = data?.unique_users ?? 0;

  const pieData = useMemo(() => [
    { name: 'Заявок IT', value: tickets, color: '#f87171' },
    { name: 'Новостей создано', value: newsCreated, color: '#60a5fa' },
    { name: 'Новостей прочитано', value: newsRead, color: '#34d399' },
  ].filter(d => d.value > 0), [tickets, newsCreated, newsRead]);

  const reload = () => setDays((d) => (d === 7 ? 30 : 7));

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Аналитика</h1>
          <p className="mt-1 text-sm text-slate-500">Активность пользователей за {days} дней</p>
        </div>
        <button onClick={reload} className="rounded-lg border border-cyber-border bg-slate-900 px-4 py-2 text-xs text-slate-300 hover:text-white">
          Период: {days === 7 ? '7 дней' : '30 дней'}
        </button>
      </div>

      {error && <div className="card p-4 text-sm text-rose-300">Ошибка: {error}</div>}

      {/* Карточки */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Уникальных пользователей', value: uniqueUsers, color: 'text-emerald-300' },
          { label: 'Авторизаций', value: logins.reduce((a, r) => a + r.count, 0), color: 'text-sky-300' },
          { label: 'Заявок в IT', value: tickets, color: 'text-rose-300' },
          { label: 'Новостей прочитано', value: newsRead, color: 'text-amber-300' },
        ].map((s, i) => (
          <div key={i} className="card p-4">
            <div className="text-xs text-slate-500">{s.label}</div>
            <div className={`mt-1 font-mono text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Графики */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Авторизации по дням</h3>
          {loading ? (
            <div className="skeleton h-48 w-full" />
          ) : (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={logins}>
                  <CartesianGrid stroke="#1e2a3d" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2a3d' }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2a3d' }} />
                  <Tooltip content={<TooltipCard />} />
                  <Bar dataKey="count" name="Входы" fill="#34d399" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Популярные разделы</h3>
          {loading ? (
            <div className="skeleton h-48 w-full" />
          ) : (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sections.slice(0, 8)} layout="vertical">
                  <CartesianGrid stroke="#1e2a3d" strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2a3d' }} />
                  <YAxis type="category" dataKey="path" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2a3d' }} width={120} />
                  <Tooltip content={<TooltipCard />} />
                  <Bar dataKey="count" name="Просмотры" fill="#60a5fa" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Соотношение событий</h3>
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
                  <Tooltip content={<TooltipCard />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card overflow-hidden">
          <h3 className="border-b border-cyber-border px-4 py-2.5 text-sm font-semibold text-slate-300">Топ пользователей</h3>
          <div className="max-h-48 divide-y divide-cyber-border/50 overflow-y-auto">
            {users.length === 0 && <div className="p-4 text-xs text-slate-500">Нет данных</div>}
            {users.map((u, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-2 font-mono text-xs">
                <span className="truncate text-slate-200">{u.full_name || u.username}</span>
                <span className="text-slate-400">{u.count} событий</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
