/**
 * HelpdeskAdmin — панель администратора: все заявки, обработка, трекер
 */
import { useMemo, useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import TicketCard from '../components/TicketCard';
import { getUserName, TICKET_STATUS_STYLES } from '../lib/desk';
import { API_BASE, formatRelativeTime } from '../lib/api';
import { authSend, getAuth } from '../lib/portal-auth';

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'new', label: 'Новые' },
  { key: 'in_progress', label: 'В работе' },
  { key: 'done', label: 'Выполненные' },
  { key: 'cancelled', label: 'Отменённые' },
];

export default function HelpdeskAdmin() {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  const authHeaders = useMemo(() => {
    const t = getAuth()?.token;
    return t ? { Authorization: `Bearer ${t}` } : undefined;
  }, []);
  const url = `${API_BASE}/api/helpdesk?limit=300`;
  const { data, error, refetch, lastUpdated } = useFetch(url, { interval: 10000, headers: authHeaders });

  const tickets = useMemo(() => {
    let list = Array.isArray(data) ? data : [];
    if (filter !== 'all') list = list.filter((t) => t.status === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        t.employee_name.toLowerCase().includes(q) ||
        String(t.id) === q
      );
    }
    return list;
  }, [data, filter, search]);

  const counts = useMemo(() => {
    const list = Array.isArray(data) ? data : [];
    return {
      all: list.length,
      new: list.filter((t) => t.status === 'new').length,
      in_progress: list.filter((t) => t.status === 'in_progress').length,
      done: list.filter((t) => t.status === 'done').length,
      cancelled: list.filter((t) => t.status === 'cancelled').length,
    };
  }, [data]);

  const update = async (ticket, updates) => {
    setBusyId(ticket.id);
    try {
      await authSend(`${API_BASE}/api/helpdesk/${ticket.id}`, 'PATCH', {
        ...updates,
        assignee: getUserName() || 'Администратор',
      });
      refetch();
    } catch (e) {
      alert(`Ошибка: ${e.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const comment = async (ticket, message) => {
    setBusyId(ticket.id);
    try {
      await authSend(`${API_BASE}/api/helpdesk/${ticket.id}/events`, 'POST', {
        author: getUserName() || 'Администратор',
        message,
      });
      refetch();
    } catch (e) {
      alert(`Ошибка: ${e.message}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#1f2937]">Заявки · Панель администратора</h1>
          <p className="mt-1 text-sm text-slate-500">
            Всего: {counts.all} · новых: {counts.new} · в работе: {counts.in_progress}
            {lastUpdated && ` · обновлено ${formatRelativeTime(new Date(lastUpdated).toISOString())}`}
          </p>
        </div>
        <input
          className="w-full max-w-xs rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20"
          placeholder="Поиск по теме, описанию, ФИО…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Статистика */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ['Новые', counts.new, 'text-sky-600', TICKET_STATUS_STYLES.new],
          ['В работе', counts.in_progress, 'text-amber-600', TICKET_STATUS_STYLES.in_progress],
          ['Выполненные', counts.done, 'text-emerald-600', TICKET_STATUS_STYLES.done],
          ['Отменённые', counts.cancelled, 'text-slate-500', TICKET_STATUS_STYLES.cancelled],
        ].map(([label, count, textCls, borderCls]) => (
          <div key={label} className={`rounded-xl border ${borderCls} bg-white p-4 shadow-sm`}>
            <p className={`text-2xl font-bold ${textCls}`}>{count}</p>
            <p className="mt-0.5 text-sm text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === key ? 'bg-[#e63a2e] text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-[#2b3a4b]'
            }`}
          >
            {label}
            {key !== 'all' && counts[key] > 0 && <span className="ml-1.5 text-xs opacity-70">{counts[key]}</span>}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          Не удалось загрузить заявки: {error}. Повтор через 10 секунд…
        </div>
      )}

      {tickets.length === 0 && !error && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-14 text-center">
          <p className="font-semibold text-slate-600">Заявок нет</p>
          <p className="mt-2 text-sm text-slate-400">
            Заявки, созданные сотрудниками на странице «IT-поддержка», появятся здесь автоматически.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {tickets.map((t) => (
          <TicketCard
            key={t.id}
            ticket={t}
            isAdmin
            busy={busyId === t.id}
            onUpdate={update}
            onComment={comment}
          />
        ))}
      </div>
    </div>
  );
}
