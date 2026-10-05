/**
 * PhoneBook — телефонный справочник (структура как в tel.pdf):
 * секции-корпуса с кабинетами и внутренними номерами, «прямые линии».
 * Поиск и фильтр по секции. Клик по номеру — звонок (TAPI → wt52:// → callto:).
 * Админ может добавлять/изменять/удалять строки справочника.
 */
import { useMemo, useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { authSend, getAuth } from '../lib/portal-auth';
import { API_BASE } from '../lib/api';

const inputCls =
  'w-full rounded-lg border-slate-300 bg-white px-4 py-2.5 text-base text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20';

const dial = async (number) => {
  if (!number) return;
  try {
    const r = await authSend(`${API_BASE}/api/phonebook/dial`, 'POST', { number });
    alert(`📞 ${r.detail}`);
  } catch (e) {
    alert(`Не удалось позвонить: ${e.message}`);
  }
};

const EMPTY_ROW = { building: '', room_no: '', title: '', phones: '', department: '', full_name: '' };

export default function PhoneBook() {
  const auth = getAuth();
  const isAdmin = auth?.user?.role === 'admin';
  const [search, setSearch] = useState('');
  const [building, setBuilding] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_ROW);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [editRow, setEditRow] = useState(null); // редактируемая строка {id, room_no, title, phones}

  const authHeaders = useMemo(() => {
    const t = getAuth()?.token;
    return t ? { Authorization: `Bearer ${t}` } : undefined;
  }, []);
  const { data, error, loading, refetch } = useFetch(`${API_BASE}/api/phonebook/rooms`, {
    interval: 0,
    headers: authHeaders,
  });
  const groups = Array.isArray(data) ? data : [];
  const buildings = useMemo(() => groups.map((g) => g.building), [groups]);

  // Поиск + фильтр: фильтруем на клиенте, пустые секции скрываем
  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups
      .filter((g) => !building || g.building === building)
      .map((g) => ({
        ...g,
        rooms: g.rooms.filter((r) => {
          if (!q) return true;
          return [g.building, r.room_no, r.title, r.phones, r.department, r.full_name]
            .filter(Boolean)
            .some((s) => String(s).toLowerCase().includes(q));
        }),
      }))
      .filter((g) => g.rooms.length > 0);
  }, [groups, search, building]);

  const total = visibleGroups.reduce((s, g) => s + g.rooms.length, 0);

  const startAdd = () => {
    setEditRow(null);
    setForm({ ...EMPTY_ROW, building: building || groups[0]?.building || '' });
    setAdding(true);
    setFormError(null);
  };

  const startEdit = (room, sectionBuilding) => {
    setAdding(false);
    setEditRow({
      id: room.id, building: sectionBuilding,
      room_no: room.room_no || '', title: room.title || '',
      phones: room.phones || '', department: room.department || '', full_name: room.full_name || '',
    });
    setFormError(null);
  };

  const saveAdd = async () => {
    if (!form.title.trim() && !form.full_name.trim()) {
      setFormError('Укажите кабинет или ФИО');
      return;
    }
    if (!form.building) {
      setFormError('Выберите секцию (корпус)');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await authSend(`${API_BASE}/api/phonebook/rooms`, 'POST', form);
      setAdding(false);
      setForm(EMPTY_ROW);
      refetch();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    setBusy(true);
    setFormError(null);
    try {
      await authSend(`${API_BASE}/api/phonebook/rooms/${editRow.id}`, 'POST', editRow);
      setEditRow(null);
      refetch();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeRow = async (room) => {
    if (!window.confirm(`Удалить строку «${room.title}»?`)) return;
    try {
      await authSend(`${API_BASE}/api/phonebook/rooms/${room.id}`, 'DELETE');
      refetch();
    } catch (e) {
      alert(`Ошибка удаления: ${e.message}`);
    }
  };

  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setEditField = (k) => (e) => setEditRow((r) => ({ ...r, [k]: e.target.value }));

  return (
    <div className="animate-fade-in space-y-5">
      {/* Заголовок + поиск */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#1f2937]">Телефонный справочник</h1>
          <p className="mt-1 text-sm text-slate-500">
            Кабинеты и внутренние номера по корпусам · показано строк: {total}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputCls} max-w-xs`}
            placeholder="Поиск: кабинет, №, номер…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className={`${inputCls} max-w-[300px]`} value={building} onChange={(e) => setBuilding(e.target.value)}>
            <option value="">Все секции</option>
            {buildings.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          {(search || building) && (
            <button className="text-xs text-sky-600 hover:underline" onClick={() => { setSearch(''); setBuilding(''); }}>
              Сбросить
            </button>
          )}
          {isAdmin && (
            <button
              className="rounded-lg bg-[#e63a2e] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#c9301f]"
              onClick={startAdd}
            >
              + Добавить
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          Не удалось загрузить справочник: {error}
        </div>
      )}

      {/* Форма добавления строки (админ) */}
      {adding && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <span className="h-4 w-1 rounded-full bg-[#e63a2e]" />
            <h2 className="text-base font-bold text-[#1f2937]">Новая строка справочника</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Секция (корпус)</span>
              <input className={inputCls} list="pb-buildings" value={form.building} onChange={setField('building')} placeholder="Шеронова, 6" />
              <datalist id="pb-buildings">
                {buildings.map((b) => <option key={b} value={b} />)}
              </datalist>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">№ каб.</span>
              <input className={inputCls} value={form.room_no} onChange={setField('room_no')} placeholder="напр., 205" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Кабинет</span>
              <input className={inputCls} value={form.title} onChange={setField('title')} placeholder="Гинекология" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Телефон(ы)</span>
              <input className={inputCls} value={form.phones} onChange={setField('phones')} placeholder="205 или 238, 011" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Отдел</span>
              <input className={inputCls} value={form.department} onChange={setField('department')} placeholder="Клинический отдел" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">ФИО</span>
              <input className={inputCls} value={form.full_name} onChange={setField('full_name')} placeholder="Иванова Анна Ивановна" />
            </label>
          </div>
          {formError && <p className="mt-3 rounded-lg border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600">{formError}</p>}
          <div className="mt-4 flex gap-2">
            <button className="rounded-lg bg-[#e63a2e] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#c9301f] disabled:opacity-50" onClick={saveAdd} disabled={busy}>
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button className="rounded-lg border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-400" onClick={() => setAdding(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Форма редактирования строки (админ) */}
      {editRow && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <span className="h-4 w-1 rounded-full bg-amber-500" />
            <h2 className="text-base font-bold text-[#1f2937]">Редактирование: {editRow.title}</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Секция</span>
              <input className={inputCls} value={editRow.building} onChange={setEditField('building')} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">№ каб.</span>
              <input className={inputCls} value={editRow.room_no} onChange={setEditField('room_no')} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Кабинет</span>
              <input className={inputCls} value={editRow.title} onChange={setEditField('title')} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Телефон(ы)</span>
              <input className={inputCls} value={editRow.phones} onChange={setEditField('phones')} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Отдел</span>
              <input className={inputCls} value={editRow.department} onChange={setEditField('department')} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">ФИО</span>
              <input className={inputCls} value={editRow.full_name} onChange={setEditField('full_name')} />
            </label>
          </div>
          {formError && <p className="mt-3 rounded-lg border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600">{formError}</p>}
          <div className="mt-4 flex gap-2">
            <button className="rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50" onClick={saveEdit} disabled={busy}>
              {busy ? 'Сохранение…' : 'Сохранить'}
            </button>
            <button className="rounded-lg border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-400" onClick={() => setEditRow(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20 w-full" />)}
        </div>
      )}

      {!loading && visibleGroups.length === 0 && (
        <div className="rounded-xl border-dashed border-slate-300 bg-white p-14 text-center">
          <p className="font-semibold text-slate-600">Ничего не найдено</p>
          <p className="mt-1 text-sm text-slate-400">Измените запрос или сбросьте фильтры.</p>
        </div>
      )}

      {/* Секции-корпуса */}
      {visibleGroups.map((g) => (
        <section key={g.building} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
            <span className="text-lg">{g.building === 'Прямые линии' ? '☎️' : '🏢'}</span>
            <h2 className="font-bold text-[#1f2937]">{g.building}</h2>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">{g.rooms.length}</span>
          </div>
          <div className="overflow-x-auto p-5">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-2 py-2 font-semibold w-24">№ каб.</th>
                  <th className="px-2 py-2 font-semibold">Кабинет</th>
                  <th className="px-2 py-2 font-semibold w-48">Тел.</th>
                  <th className="px-2 py-2 font-semibold">Отдел</th>
                  <th className="px-2 py-2 font-semibold">ФИО</th>
                  {isAdmin && <th className="w-16" />}
                </tr>
              </thead>
              <tbody>
                {g.rooms.map((r) => (
                  <tr key={r.id} className="group border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-2 py-2">
                      {r.room_no ? (
                        <span className="inline-block rounded bg-slate-100 px-1.5 font-mono text-xs font-bold text-[#2b3a4b]">{r.room_no}</span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-slate-700">{r.title || '—'}</td>
                    <td className="px-2 py-2">
                      {r.phones ? (
                        <span className="flex flex-wrap items-center gap-1">
                          {r.phones.split(',').map((p) => (
                            <button
                              key={p}
                              className="rounded-lg bg-[#e63a2e]/10 px-2 py-0.5 font-mono text-xs font-semibold text-[#e63a2e] transition-colors hover:bg-[#e63a2e] hover:text-white"
                              title={`Позвонить ${p.trim()}`}
                              onClick={() => dial(p.trim())}
                            >
                              {p.trim()}
                            </button>
                          ))}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-slate-600">{r.department || <span className="text-slate-300">—</span>}</td>
                    <td className="px-2 py-2 text-slate-700">{r.full_name || <span className="text-slate-300">—</span>}</td>
                    {isAdmin && (
                      <td className="px-2 py-2 text-right">
                        <span className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button className="rounded px-1.5 text-xs text-slate-400 hover:bg-slate-200 hover:text-slate-700" title="Изменить" onClick={() => startEdit(r, g.building)}>✎</button>
                          <button className="rounded px-1.5 text-xs text-slate-400 hover:bg-rose-100 hover:text-rose-600" title="Удалить" onClick={() => removeRow(r)}>✕</button>
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
