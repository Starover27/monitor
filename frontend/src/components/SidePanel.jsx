/**
 * SidePanel — правая колонка портала: календарь-органайзер задач + «Мои сообщения».
 * Органайзер: задачи на дату, переадресация сотрудникам (уведомление на почту),
 * принятие/выполнение получателем. Сообщения: список, отправка, непрочитанные.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { authSend, getAuth } from '../lib/portal-auth';
import { API_BASE, formatDateTime } from '../lib/api';
import NewTaskModal from './NewTaskModal';

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const WEEKDAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

/** Значок «день рождения»: торт со свечой (SVG — цветной, без эмодзи-артефактов). */
function CakeIcon({ size = 12, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <ellipse cx="12" cy="3" rx="1.3" ry="1.8" fill="#f97316" />
      <rect x="11.1" y="4.6" width="1.8" height="4.2" rx="0.9" fill="#fbbf24" />
      <path d="M5 9.5h14a1.5 1.5 0 0 1 1.5 1.5v1.4c0 .8-.7 1.5-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V11A1.5 1.5 0 0 1 5 9.5z" fill="#f9a8d4" />
      <path d="M4.6 13.6c.9 2 2.6 2 3.5 0 .9 2 2.6 2 3.5 0 .9 2 2.6 2 3.5 0 .9 2 2.6 2 3.5 0 .9 2 2.6 2 3.5 0" stroke="#ec4899" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <rect x="4.5" y="16" width="15" height="4.6" rx="1.6" fill="#fde68a" />
      <line x1="6" y1="18.3" x2="18" y2="18.3" stroke="#f59e0b" strokeWidth="1" opacity="0.55" />
    </svg>
  );
}

export default function SidePanel() {
  return (
    <aside className="w-full space-y-4 lg:w-80 lg:shrink-0">
      <CalendarWidget />
      <MessagesWidget />
    </aside>
  );
}

/* ==================== Календарь-органайзер задач ==================== */

function toIso(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function CalendarWidget() {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [tasks, setTasks] = useState([]);
  const [selected, setSelected] = useState(null); // ISO-дата открытого дня
  const [modalOpen, setModalOpen] = useState(false); // окно «Новая задача»
  const [people, setPeople] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState('day'); // day | all
  const [showDone, setShowDone] = useState(false); // показывать выполненные в «все»
  const [editing, setEditing] = useState(null); // {id, title, due_date, details}
  const [birthdays, setBirthdays] = useState([]); // [{full_name, birth_date, position}]
  const todayIso = toIso(today);
  const myName = getAuth()?.user?.full_name || getAuth()?.user?.username || '';
  const myUsername = getAuth()?.user?.username || '';

  // Дни рождения сотрудников: календарь помечает даты, в панели дня — список
  useEffect(() => {
    authSend(`${API_BASE}/api/birthdays`, 'GET').then((list) => setBirthdays(list || [])).catch(() => {});
  }, []);

  const birthByMd = useMemo(() => {
    const map = {};
    for (const b of birthdays) {
      const [y, mo, d] = (b.birth_date || '').split('-');
      if (!y || !mo || !d) continue;
      const key = `${mo}-${d}`;
      (map[key] = map[key] || []).push(b);
    }
    return map;
  }, [birthdays]);

  const ageOn = (birth_date, iso) => {
    const [by, bm, bd] = birth_date.split('-').map(Number);
    const [ty, tm, td] = iso.split('-').map(Number);
    let age = ty - by;
    if (tm < bm || (tm === bm && td < bd)) age -= 1;
    return age > 0 ? age : null;
  };

  const cells = useMemo(() => {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    // Пн=0
    const offset = (first.getDay() + 6) % 7;
    const out = [];
    for (let i = 0; i < offset; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(y, m, d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [cursor]);

  const isToday = (d) => d && toIso(d) === todayIso;

  const loadTasks = async () => {
    try {
      const list = await authSend(`${API_BASE}/api/tasks`, 'GET');
      setTasks(list || []);
    } catch (e) { setError(e.message); }
  };
  const loadPeople = async () => {
    try { setPeople(await authSend(`${API_BASE}/api/tasks/users`, 'GET') || []); } catch { /* noop */ }
  };

  useEffect(() => {
    loadTasks();
    loadPeople();
    const t = setInterval(loadTasks, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive_deps
  }, []);

  const byDate = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      if (!t.done && t.due_date) (map[t.due_date] = map[t.due_date] || []).push(t);
    }
    return map;
  }, [tasks]);

  const openTasks = tasks.filter((t) => !t.done);
  const visibleTasks = view === 'all' && showDone ? tasks : openTasks;
  const dayTasks = selected ? tasks.filter((t) => t.due_date === selected && (showDone || !t.done)) : [];

  const saveEdit = async () => {
    if (!editing || !editing.title.trim()) { setError('Введите текст задачи'); return; }
    setBusy(true);
    setError(null);
    try {
      await authSend(`${API_BASE}/api/tasks/${editing.id}`, 'PATCH', {
        title: editing.title.trim(),
        details: editing.details || null,
        due_date: editing.due_date || null,
      });
      setEditing(null);
      loadTasks();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const reforward = async (t, assigneeName) => {
    try {
      await authSend(`${API_BASE}/api/tasks/${t.id}`, 'PATCH', { assignee: assigneeName || null });
      loadTasks();
    } catch (e) { setError(e.message); }
  };

  const setDone = async (t, done) => {
    try { await authSend(`${API_BASE}/api/tasks/${t.id}`, 'PATCH', { done }); loadTasks(); }
    catch (e) { setError(e.message); }
  };
  const accept = async (t, accepted) => {
    try { await authSend(`${API_BASE}/api/tasks/${t.id}`, 'PATCH', { accepted }); loadTasks(); }
    catch (e) { setError(e.message); }
  };
  const removeTask = async (t) => {
    if (!window.confirm('Удалить задачу?')) return;
    try { await authSend(`${API_BASE}/api/tasks/${t.id}`, 'DELETE'); loadTasks(); }
    catch (e) { setError(e.message); }
  };

  const TaskRow = ({ t }) => {
    const isMine = t.owner === myName || (myUsername && t.owner === myUsername);
    const assignedToMe = t.assignee && !isMine;
    const isEditing = editing && editing.id === t.id;
    return (
      <div className={`rounded-lg border px-2.5 py-2 ${t.done ? 'border-slate-100 bg-slate-50 opacity-70' : assignedToMe ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-white'}`}>
{isEditing ? (
           <div className="space-y-1.5">
             <input
               className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-black outline-none focus:border-[#e63a2e]"
               value={editing.title}
               onChange={(e) => setEditing((x) => ({ ...x, title: e.target.value }))}
             />
             <input
               type="date"
               className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-black outline-none focus:border-[#e63a2e]"
               value={editing.due_date || ''}
               onChange={(e) => setEditing((x) => ({ ...x, due_date: e.target.value }))}
             />
             <input
               className="w-full rounded border border-slate-300 px-2 py-1 text-xs text-black outline-none focus:border-[#e63a2e]"
               placeholder="Описание (необязательно)"
               value={editing.details || ''}
               onChange={(e) => setEditing((x) => ({ ...x, details: e.target.value }))}
             />
             <div className="flex gap-1.5">
               <button className="rounded bg-[#e63a2e] px-2 py-0.5 text-[10px] font-bold text-white hover:bg-[#c9301f]" onClick={saveEdit} disabled={busy}>Сохранить</button>
               <button className="rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100" onClick={() => setEditing(null)}>Отмена</button>
             </div>
           </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#e63a2e]" checked={!!t.done} onChange={(e) => setDone(t, e.target.checked)} />
                <span className="min-w-0">
                   <span className={`block truncate text-sm font-semibold ${t.done ? 'text-slate-400 line-through' : 'text-[#1f2937]'}`} title={t.title}>{t.title}</span>
                   {t.details && <span className="mt-0.5 block truncate text-[11px] text-slate-500" title={t.details}>{t.details}</span>}
                   {t.document_url && (
                     <a
                       href={t.document_url}
                       title={t.document_url}
                       className="mt-0.5 inline-flex max-w-full items-center gap-1 text-[11px] font-medium text-sky-600 hover:underline"
                     >
                       <span className="truncate">📎 {t.document_url.replace(/.*[/\\]/, '')}</span>
                     </a>
                   )}
                  <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
                    {t.due_date && <span>📅 {t.due_date}</span>}
                    {t.forwarded && <span className="rounded bg-amber-100 px-1 font-bold text-amber-700">→ {t.assignee}</span>}
                    {t.forwarded && isMine && t.accepted == null && <span className="text-amber-600">ожидает ответа</span>}
                    {t.forwarded && isMine && t.accepted === true && <span className="text-emerald-600">принята</span>}
                    {t.forwarded && isMine && t.accepted === false && <span className="text-rose-600">отклонена</span>}
                    {assignedToMe && <span>от {t.owner}</span>}
                  </span>
                  {/* Переадресация задачами (всегда видна владельцу открытой задачи) */}
                  {isMine && !t.done && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">Кому:</span>
                      <select
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-black outline-none focus:border-[#e63a2e]"
                        value={t.assignee || ''}
                        onChange={(e) => reforward(t, e.target.value)}
                        title="Перенаправить задачу другому сотруднику (придёт уведомление на почту)"
                      >
                        <option value="">выполняю сам</option>
                        {people.filter((p) => p.full_name !== t.owner && p.username !== t.owner).map((p) => (
                          <option key={p.id} value={p.full_name}>{p.full_name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </span>
              </label>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {assignedToMe && t.accepted == null && !t.done && (
                  <div className="flex gap-1">
                    <button className="rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-600" title="Принять" onClick={() => accept(t, true)}>✓</button>
                    <button className="rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-rose-600" title="Отклонить" onClick={() => accept(t, false)}>✗</button>
                  </div>
                )}
                {isMine && !t.done && (
                  <button
                    className="rounded px-1 py-0.5 text-[10px] text-slate-300 hover:bg-slate-100 hover:text-slate-600"
                    title="Редактировать"
                    onClick={() => setEditing({ id: t.id, title: t.title, due_date: t.due_date || '', details: t.details || '' })}
                  >✎</button>
                )}
                {(isMine || assignedToMe) && (
                  <button className="text-[10px] text-slate-300 hover:text-rose-500" onClick={() => removeTask(t)}>удалить</button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <span className="flex items-center gap-2">
          <span className="text-lg">🗓️</span>
          <span className="text-sm font-bold text-[#1f2937]">Органайзер</span>
          {openTasks.length > 0 && (
            <span className="rounded-full bg-[#e63a2e] px-2 py-0.5 text-[11px] font-bold text-white">{openTasks.length}</span>
          )}
        </span>
        <div className="flex gap-1">
          <button className={`rounded px-2 py-0.5 text-[10px] font-bold ${view === 'day' ? 'bg-slate-100 text-[#1f2937]' : 'text-slate-400 hover:text-slate-600'}`} onClick={() => setView('day')}>по дням</button>
          <button className={`rounded px-2 py-0.5 text-[10px] font-bold ${view === 'all' ? 'bg-slate-100 text-[#1f2937]' : 'text-slate-400 hover:text-slate-600'}`} onClick={() => setView('all')}>все</button>
          {view === 'all' && (
            <button
              className={`rounded px-2 py-0.5 text-[10px] font-bold ${showDone ? 'bg-emerald-100 text-emerald-700' : 'text-slate-400 hover:text-slate-600'}`}
              title="Показывать выполненные задачи"
              onClick={() => setShowDone((v) => !v)}
            >✓</button>
          )}
        </div>
      </div>

      {/* Мини-календарь */}
      <div className="px-3 pt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <button className="rounded px-2 py-0.5 text-slate-400 hover:bg-slate-100" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>‹</button>
          <span className="text-xs font-bold text-[#1f2937]">{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</span>
          <button className="rounded px-2 py-0.5 text-slate-400 hover:bg-slate-100" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>›</button>
        </div>
        <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-bold uppercase text-slate-400">
          {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5 pb-1 text-center">
          {cells.map((d, i) => {
            const iso = d ? toIso(d) : null;
            const has = iso && byDate[iso];
            return (
              <button
                key={i}
                onClick={() => d && setSelected(iso === selected ? null : iso)}
                className={
                  'relative flex h-9 items-center justify-center rounded-md text-sm font-semibold antialiased ' +
                  (d ? (
                    iso === selected ? 'bg-[#e63a2e] text-white shadow-sm'
                      : isToday(d) ? 'bg-[#e63a2e]/10 font-bold text-[#e63a2e]'
                      : (d.getDay() === 6 || d.getDay() === 0) ? 'text-rose-400 hover:bg-slate-100'
                      : 'text-slate-700 hover:bg-slate-100'
                  ) : '')
                }
              >
                {d ? d.getDate() : ''}
                {has && <span className="absolute bottom-0.5 h-1.5 w-1.5 rounded-full bg-[#e63a2e]" />}
                {d && iso && birthByMd[`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`] && (
                  <span className="absolute right-0 top-0.5" title="День рождения">
                    <CakeIcon size={10} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Задачи */}
      <div className="max-h-60 space-y-1.5 overflow-y-auto border-t border-slate-100 p-3">
        {error && <p className="text-xs text-rose-600">{error}</p>}
        {view === 'day' && selected && (() => {
          const [ , mo, dd] = selected.split('-');
          const bday = birthByMd[`${mo}-${dd}`];
          if (!bday || bday.length === 0) return null;
          return (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700"><CakeIcon size={14} /> Дни рождения</p>
              {bday.map((b) => {
                const age = ageOn(b.birth_date, selected);
                return (
                  <p key={b.id} className="mt-0.5 text-xs text-slate-600">
                    {b.full_name}{age != null ? ` — ${age} лет` : ''}
                  </p>
                );
              })}
            </div>
          );
        })()}
        {view === 'all' && visibleTasks.map((t) => <TaskRow key={t.id} t={t} />)}
        {view === 'day' && selected && dayTasks.map((t) => <TaskRow key={t.id} t={t} />)}
        {view === 'day' && !selected && <p className="py-2 text-center text-xs text-slate-400">Выберите день в календаре или включите «все»</p>}
        {view === 'day' && selected && dayTasks.length === 0 && <p className="py-2 text-center text-xs text-slate-400">На этот день задач нет</p>}
        {view === 'all' && visibleTasks.length === 0 && (
          <p className="py-2 text-center text-xs text-slate-400">{showDone ? 'Задач нет' : 'Открытых задач нет'}</p>
        )}
      </div>

      {/* Новая задача — кнопка открывает окно: галочки сотрудников/отделов + документ */}
      <div className="border-t border-slate-100 p-3">
        <button
          className="w-full rounded-lg bg-[#e63a2e] px-3 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#c9301f]"
          onClick={() => setModalOpen(true)}
        >
          ＋ Новая задача
        </button>
      </div>

      {modalOpen && (
        <NewTaskModal
          people={people}
          myName={myName || myUsername}
          defaultDue={selected || todayIso}
          onClose={() => setModalOpen(false)}
          onCreated={() => loadTasks()}
        />
      )}
    </div>
  );
}

/* ==================== Сообщения ==================== */

function MessagesWidget() {
  const me = getAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [inbox, setInbox] = useState([]);
  const [sent, setSent] = useState([]);
  const [tab, setTab] = useState('inbox'); // inbox | sent
  const [partners, setPartners] = useState([]);
  const [composeTo, setComposeTo] = useState(null); // partner id or null
  const [composeForm, setComposeForm] = useState({ recipient_id: '', body: '' });
  const [replyTo, setReplyTo] = useState(null); // message being replied
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const openRef = useRef(false);

  const loadAll = async (light = false) => {
    try {
      if (light) {
        // Фоновый опрос: только счётчик непрочитанных — не дёргаем все списки
        const cnt = await authSend(`${API_BASE}/api/messages/unread-count`, 'GET');
        setUnread(cnt?.count || 0);
        return;
      }
      const [cnt, ib, st, ps] = await Promise.all([
        authSend(`${API_BASE}/api/messages/unread-count`, 'GET'),
        authSend(`${API_BASE}/api/messages/inbox`, 'GET'),
        authSend(`${API_BASE}/api/messages/sent`, 'GET'),
        authSend(`${API_BASE}/api/messages/users`, 'GET'),
      ]);
      setUnread(cnt?.count || 0);
      setInbox(ib || []);
      setSent(st || []);
      setPartners(ps || []);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (!me?.token) return;
    loadAll();
    // Пока панель закрыта — лёгкий опрос счётчика раз в 30 секунд;
    // полная перезагрузка списков происходит при открытии панели и после действий
    pollRef.current = setInterval(() => {
      if (!openRef.current) loadAll(true);
    }, 30000);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Полная перезагрузка списков при открытии панели
  useEffect(() => {
    if (open && me?.token) loadAll();
  }, [open]);
  useEffect(() => { openRef.current = open; }, [open]);

  const openMessage = async (m) => {
    if (!m.outgoing && !m.read_at) {
      try { await authSend(`${API_BASE}/api/messages/${m.id}/read`, 'POST'); } catch { /* noop */ }
      loadAll();
    }
  };

  const removeMessage = async (m) => {
    if (!window.confirm('Удалить сообщение?')) return;
    try {
      await authSend(`${API_BASE}/api/messages/${m.id}`, 'DELETE');
      loadAll();
    } catch (e) { setError(e.message); }
  };

  const send = async () => {
    if (!composeForm.recipient_id || !composeForm.body.trim()) {
      setError('Выберите получателя и напишите текст');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await authSend(`${API_BASE}/api/messages`, 'POST', composeForm);
      setComposeForm({ recipient_id: '', body: '' });
      setReplyTo(null);
      setComposeTo(null);
      loadAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const startReply = (m) => {
    setComposeTo(true);
    setComposeForm({ recipient_id: m.sender_id, body: '' });
    setReplyTo(m);
  };

  const list = tab === 'inbox' ? inbox : sent;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2">
          <span className="text-lg">✉️</span>
          <span className="text-sm font-bold text-[#1f2937]">Мои сообщения</span>
          {unread > 0 && (
            <span className="rounded-full bg-[#e63a2e] px-2 py-0.5 text-[11px] font-bold text-white">{unread}</span>
          )}
        </span>
        <span className="text-slate-400">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3 py-3">
          <div className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-1">
            {[['inbox', `Входящие (${inbox.length})`], ['sent', `Отправленные (${sent.length})`]].map(([k, label]) => (
              <button
                key={k}
                onClick={() => { setTab(k); setReplyTo(null); }}
                className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                  tab === k ? 'bg-white text-[#1f2937] shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >{label}</button>
            ))}
          </div>

          {/* Написать */}
          {!composeTo && (
            <button
              className="mb-2 w-full rounded-lg bg-[#2b3a4b] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#e63a2e]"
              onClick={() => { setComposeTo(true); setComposeForm({ recipient_id: partners[0]?.id || '', body: '' }); }}
            >
              ✍️ Написать сообщение
            </button>
          )}
          {composeTo && (
            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              {replyTo && (
                <p className="mb-1.5 text-[11px] text-slate-400">Ответ для: <b>{replyTo.sender_name}</b></p>
              )}
              <select
                className="mb-2 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-black outline-none focus:border-[#e63a2e]"
                value={composeForm.recipient_id}
                onChange={(e) => setComposeForm((f) => ({ ...f, recipient_id: Number(e.target.value) }))}
              >
                <option value="">— кому —</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </select>
              <textarea
                className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-black outline-none placeholder:text-slate-400 focus:border-[#e63a2e]"
                rows={3}
                placeholder="Текст сообщения…"
                value={composeForm.body}
                onChange={(e) => setComposeForm((f) => ({ ...f, body: e.target.value }))}
              />
              <div className="mt-2 flex gap-2">
                <button
                  className="flex-1 rounded-lg bg-[#e63a2e] px-3 py-2 text-xs font-semibold text-white hover:bg-[#c9301f] disabled:opacity-50"
                  onClick={send}
                  disabled={busy}
                >{busy ? 'Отправка…' : 'Отправить'}</button>
                <button
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:border-slate-400"
                  onClick={() => { setComposeTo(false); setReplyTo(null); }}
                >Отмена</button>
              </div>
            </div>
          )}

          {error && <p className="mb-2 text-xs text-rose-600">{error}</p>}

          {/* Список */}
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {list.length === 0 && (
              <p className="py-4 text-center text-xs text-slate-400">Писем нет</p>
            )}
            {list.map((m) => (
              <div
                key={m.id}
                onClick={() => openMessage(m)}
                className={`cursor-pointer rounded-lg border px-2.5 py-2 transition-colors hover:bg-slate-50 ${
                  !m.outgoing && !m.read_at ? 'border-[#e63a2e]/30 bg-[#e63a2e]/[0.04]' : 'border-slate-100 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-bold text-[#1f2937]">
                    {m.outgoing ? `→ ${m.recipient_name}` : m.sender_name}
                  </span>
                  <span className="shrink-0 text-[10px] text-slate-400">{formatDateTime(m.created_at, true)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{m.body}</p>
                <div className="mt-1 flex gap-2 text-[10px]">
                  {m.outgoing ? (
                    <span className={m.read_at ? 'text-emerald-500' : 'text-slate-300'}>
                      {m.read_at ? '✓ прочитано' : 'отправлено'}
                    </span>
                  ) : (
                    <button className="text-sky-600 hover:underline" onClick={(e) => { e.stopPropagation(); startReply(m); }}>Ответить</button>
                  )}
                  <button className="text-slate-300 hover:text-rose-500" onClick={(e) => { e.stopPropagation(); removeMessage(m); }}>Удалить</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
