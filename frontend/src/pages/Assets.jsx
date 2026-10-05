/**
 * Assets — раздел «Инвентаризация» в Мониторинге (тёмная тема, только админы).
 * Вкладки: Сотовые телефоны / Терминалы / Техника (категории).
 * Поля (колонки) создаёт админ; строки заполняются кликом по ячейке.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { authFetch, getAuth } from '../lib/portal-auth';
import { API_BASE } from '../lib/api';

const INPUT_CLS = 'monitor-input';

export default function Assets() {
  const [categories, setCategories] = useState([]);
  const [activeCat, setActiveCat] = useState(null); // id категории
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // {itemId, fieldId, value}

  const auth = getAuth();
  const isAdmin = auth?.user?.role === 'admin';

  const loadCategories = useCallback(async () => {
    try {
      const list = await authFetch(`${API_BASE}/api/assets/categories`);
      setCategories(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const loadItems = useCallback(async (catId, q = '') => {
    if (!catId) return;
    try {
      const url = `${API_BASE}/api/assets/items?category_id=${catId}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
      const list = await authFetch(url);
      setItems(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    loadCategories().then(() => {});
  }, [loadCategories]);

  useEffect(() => {
    if (categories.length && activeCat == null) setActiveCat(categories[0].id);
  }, [categories, activeCat]);

  useEffect(() => {
    if (activeCat != null) loadItems(activeCat, search.trim());
  }, [activeCat, loadItems, search]);

  const category = useMemo(
    () => categories.find((c) => c.id === activeCat) || categories[0] || null,
    [categories, activeCat]
  );
  const fields = category?.fields || [];

  const addItem = async () => {
    if (!category) return;
    setBusy(true);
    setError(null);
    try {
      const item = await authFetch(`${API_BASE}/api/assets/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: category.id, data: {} }),
      });
      if (item) setItems((list) => [item, ...list]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (item) => {
    if (!window.confirm('Удалить эту запись?')) return;
    try {
      await authFetch(`${API_BASE}/api/assets/items/${item.id}`, { method: 'DELETE' });
      setItems((list) => list.filter((i) => i.id !== item.id));
    } catch (e) {
      setError(e.message);
    }
  };

  const addField = async () => {
    if (!category) return;
    const name = window.prompt(`Новое поле в разделе «${category.name}»:`);
    if (!name || !name.trim()) return;
    try {
      await authFetch(`${API_BASE}/api/assets/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: category.id, name: name.trim() }),
      });
      loadCategories();
    } catch (e) {
      alert(`Ошибка: ${e.message}`);
    }
  };

  const removeField = async (f) => {
    if (!window.confirm(`Удалить поле «${f.name}» во всех записях раздела?`)) return;
    try {
      await authFetch(`${API_BASE}/api/assets/fields/${f.id}`, { method: 'DELETE' });
      loadCategories();
      setItems((list) => list.map((i) => {
        const data = { ...i.data };
        delete data[f.id];
        return { ...i, data };
      }));
    } catch (e) {
      alert(`Ошибка: ${e.message}`);
    }
  };

  const commitCell = async (item, fieldId, value) => {
    if (value === (item.data[fieldId] || item.data[String(fieldId)] || '')) return;
    try {
      await authFetch(`${API_BASE}/api/assets/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { [fieldId]: value } }),
      });
      setItems((list) => list.map((i) =>
        i.id === item.id ? { ...i, data: { ...i.data, [fieldId]: value } } : i
      ));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="animate-fade-in mx-auto max-w-6xl space-y-6">
      <div className="card p-6">
        <h1 className="flex items-center gap-3 text-xl font-bold text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-500 text-lg shadow-glow">📦</span>
          Инвентаризация
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Учёт телефонов, терминалов и техники. Разделы фиксированы,
          поля (колонки) добавляет администратор — какие нужны, значения заполняются прямо в таблице.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          ⚠ {error}
        </div>
      )}

      {/* Вкладки-категории */}
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => { setActiveCat(c.id); setSearch(''); }}
            className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
              category?.id === c.id
                ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-300'
                : 'border-cyber-border bg-slate-900/50 text-slate-400 hover:text-white'
            }`}
          >
            {c.icon} {c.name}
            <span className="ml-2 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-300">{c.items_count}</span>
          </button>
        ))}
      </div>

      {category && (
        <div className="card p-5">
          {/* Тулбар */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input
              className={`${INPUT_CLS} max-w-xs`}
              placeholder="Поиск по значениям…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="monitor-button !px-3 !py-2 text-xs" onClick={addItem} disabled={busy}>
              + Запись
            </button>
            {isAdmin && (
              <button className="btn-ghost !px-3 !py-2 text-xs" onClick={addField}>
                + Поле
              </button>
            )}
          </div>

          {/* Таблица */}
          <div className="overflow-x-auto rounded-xl border border-cyber-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-cyber-border bg-slate-900/70 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2.5 font-semibold w-10">#</th>
                  {fields.map((f) => (
                    <th key={f.id} className="group px-3 py-2.5 font-semibold">
                      <span>{f.name}</span>
                      {isAdmin && (
                        <button
                          className="ml-1.5 rounded px-1 text-[10px] text-slate-600 opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                          title="Удалить поле"
                          onClick={() => removeField(f)}
                        >✕</button>
                      )}
                    </th>
                  ))}
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={fields.length + 2} className="px-4 py-10 text-center text-slate-500">
                      Записей нет — нажмите «+ Запись», чтобы добавить первую строку.
                    </td>
                  </tr>
                )}
                {items.map((item, idx) => (
                  <tr key={item.id} className="border-b border-cyber-border/60 last:border-0 hover:bg-slate-800/30">
                    <td className="px-3 py-2 text-xs text-slate-500">{idx + 1}</td>
                    {fields.map((f) => {
                      const val = item.data[f.id] ?? item.data[String(f.id)] ?? '';
                      const isEd = editing && editing.itemId === item.id && editing.fieldId === f.id;
                      return (
                        <td key={f.id} className="px-2 py-1.5 align-top">
                          {isEd ? (
                            <input
                              autoFocus
                              className="w-full min-w-[140px] rounded-lg border border-cyan-400/50 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none"
                              defaultValue={val}
                              onBlur={(e) => {
                                commitCell(item, f.id, e.target.value);
                                setEditing(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.target.blur();
                                if (e.key === 'Escape') setEditing(null);
                              }}
                            />
                          ) : (
                            <button
                              className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-200 transition-colors hover:bg-slate-800/70"
                              onClick={() => setEditing({ itemId: item.id, fieldId: f.id, value: val })}
                              title="Кликните, чтобы изменить"
                            >
                              {val ? val : <span className="text-slate-600">—</span>}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right">
                      <button
                        className="rounded px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-rose-500/20 hover:text-rose-400"
                        title="Удалить запись"
                        onClick={() => removeItem(item)}
                      >✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
