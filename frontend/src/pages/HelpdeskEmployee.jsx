/**
 * HelpdeskEmployee — заявки в IT-поддержку (светлый корпоративный стиль)
 */
import { useMemo, useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import TicketCard from '../components/TicketCard';
import { authSend, getAuth } from '../lib/portal-auth';
import { getUserName, TICKET_CATEGORY_LABELS, TICKET_PRIORITY_LABELS } from '../lib/desk';
import { API_BASE } from '../lib/api';

const EMPTY = { title: '', category: 'pc', priority: 'normal', description: '', employee_room: '', employee_phone: '', ip_address: '' };

export default function HelpdeskEmployee() {
  const name = getUserName();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [created, setCreated] = useState(null);

  const ticketsUrl = name
    ? `${API_BASE}/api/helpdesk?employee=${encodeURIComponent(name)}`
    : null;
  const authHeaders = useMemo(() => {
    const t = getAuth()?.token;
    return t ? { Authorization: `Bearer ${t}` } : undefined;
  }, []);
  const { data, error, refetch } = useFetch(ticketsUrl, { interval: 30000, headers: authHeaders });

  const myTickets = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const activeCount = useMemo(() => myTickets.filter((t) => t.status === 'new' || t.status === 'in_progress').length, [myTickets]);

  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setFormError('Укажите тему заявки'); return; }
    setBusy(true);
    setFormError(null);
    try {
      const ticket = await authSend(`${API_BASE}/api/helpdesk`, 'POST', {
        ...form,
        employee_name: name,
      });
      setCreated(ticket);
      setForm({ ...EMPTY });
      refetch();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const sendComment = async (ticket, message) => {
    setBusy(true);
    try {
      await authSend(`${API_BASE}/api/helpdesk/${ticket.id}/events`, 'POST', { author: name || 'Сотрудник', message });
      refetch();
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1f2937]">IT-поддержка</h1>
        <p className="mt-1 text-sm text-slate-500">
          {name} · {activeCount > 0 ? `в работе заявок: ${activeCount}` : 'активных заявок нет'} · уведомления о статусе придут на почту
        </p>
      </div>

      {/* Форма новой заявки */}
      <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="h-4 w-1 rounded-full bg-[#e63a2e]" />
          <h2 className="font-bold text-[#1f2937]">Новая заявка</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Что случилось? *</span>
            <input className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20" placeholder="Кратко: например, не работает принтер" value={form.title} onChange={setField('title')} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Категория</span>
            <select className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20" value={form.category} onChange={setField('category')}>
              {Object.entries(TICKET_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Приоритет</span>
            <select className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20" value={form.priority} onChange={setField('priority')}>
              {Object.entries(TICKET_PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Внутренний телефон</span>
            <input className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20" placeholder="например, 12-34" value={form.employee_phone} onChange={setField('employee_phone')} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">IP-адрес</span>
            <input className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20" placeholder="например, 192.168.1.25" value={form.ip_address} onChange={setField('ip_address')} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Кабинет</span>
            <input className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20" placeholder="например, 214" value={form.employee_room} onChange={setField('employee_room')} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Подробности</span>
            <textarea className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20" rows={3} placeholder="Опишите проблему подробнее…" value={form.description} onChange={setField('description')} />
          </label>
        </div>
        {formError && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600">{formError}</p>
        )}
        <button className="mt-4 rounded-lg bg-[#e63a2e] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#c9301f] disabled:opacity-50" type="submit" disabled={busy}>
          {busy ? 'Отправка…' : 'Отправить заявку'}
        </button>
      </form>

      {created && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          ✅ Заявка №{created.id} создана и передана администраторам.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          Не удалось загрузить заявки: {error}
        </div>
      )}

      {/* Список заявок */}
      <h2 className="text-lg font-bold text-[#1f2937]">Мои заявки</h2>
      <div className="space-y-4">
        {myTickets.length === 0 && !error ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="font-semibold text-slate-600">Заявок пока нет</p>
            <p className="mt-1 text-sm text-slate-400">Создайте заявку выше — она сразу появится у администраторов.</p>
          </div>
        ) : (
          myTickets.map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              isAdmin={false}
              busy={busy}
              onUpdate={() => {}}
              onComment={sendComment}
            />
          ))
        )}
      </div>
    </div>
  );
}
