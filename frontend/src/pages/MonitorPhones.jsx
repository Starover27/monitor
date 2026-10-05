/**
 * MonitorPhones — таблица ручного учёта телефонов (тёмная тема мониторинга).
 * Админ сам настраивает колонки и наполняет строки.
 */
import { useMemo, useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { authSend, getAuth } from '../lib/portal-auth';
import { API_BASE } from '../lib/api';

const inputCls = 'monitor-input w-full px-2 py-1.5 text-xs';

export default function MonitorPhones() {
  const authHeaders = useMemo(() => {
    const t = getAuth()?.token;
    return t ? { Authorization: `Bearer ${t}` } : undefined;
  }, []);
  const url = `${API_BASE}/api/admin/phonetable`;
  const { data, error, refetch } = useFetch(url, { interval: 0, headers: authHeaders });
  const [busy, setBusy] = useState(false);
  const [newCol, setNewCol] = useState('');
  const [edits, setEdits] = useState({}); // rowId -> {colId: value}

  const columns = useMemo(() => (data?.columns || []).slice().sort((a, b) => a.sort_order - b.sort_order), [data]);
  const rows = useMemo(() => data?.rows || [], [data]);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
      refetch();
    } catch (e) {
      alert(`Ошибка: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const addColumn = () => {
    const name = newCol.trim();
    if (!name) return;
    run(async () => {
      await authSend(`${API_BASE}/api/admin/phonetable/columns`, 'POST', { name, sort_order: columns.length });
      setNewCol('');
    });
  };

  const addRow = () => run(async () => {
    await authSend(`${API_BASE}/api/admin/phonetable/rows`, 'POST', { data: {} });
  });

  const cellValue = (row, colId) => {
    const edit = edits[row.id]?.[colId];
    if (edit !== undefined) return edit;
    return row.data?.[String(colId)] ?? '';
  };

  const setCell = (row, colId, value) => {
    setEdits((prev) => ({
      ...prev,
      [row.id]: { ...(prev[row.id] || {}), [colId]: value },
    }));
  };

  const saveRow = (row) => run(async () => {
    const patch = edits[row.id] || {};
    const data = { ...(row.data || {}) };
    for (const [colId, v] of Object.entries(patch)) data[colId] = v;
    await authSend(`${API_BASE}/api/admin/phonetable/rows/${row.id}`, 'PATCH', { data });
    setEdits((prev) => {
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
  });

  const deleteRow = (row) => run(async () => {
    await authSend(`${API_BASE}/api/admin/phonetable/rows/${row.id}`, 'DELETE');
  });

  const renameColumn = (col) => {
    const name = window.prompt('Новое название колонки:', col.name);
    if (!name || !name.trim()) return;
    run(async () => {
      await authSend(`${API_BASE}/api/admin/phonetable/columns/${col.id}`, 'PATCH', { name: name.trim() });
    });
  };

  const deleteColumn = (col) => run(async () => {
    await authSend(`${API_BASE}/api/admin/phonetable/columns/${col.id}`, 'DELETE');
  });

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Учёт телефонов</h1>
          <p className="mt-1 text-sm text-slate-500">
            Вручную настраиваемая таблица: добавьте нужные колонки и наполняйте строки
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="monitor-input w-56"
            placeholder="Название новой колонки…"
            value={newCol}
            onChange={(e) => setNewCol(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addColumn()}
          />
          <button className="monitor-button" onClick={addColumn} disabled={busy || !newCol.trim()}>
            + Колонка
          </button>
          <button className="btn-ghost" onClick={addRow} disabled={busy}>+ Строка</button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">
          Не удалось загрузить таблицу: {error}
        </div>
      )}

      {columns.length === 0 && !error && (
        <div className="card p-14 text-center">
          <p className="text-lg font-medium text-slate-300">Колонок пока нет</p>
          <p className="mt-2 text-sm text-slate-500">
            Например: «ФИО», «Отдел», «Сотовый», «Добавочный», «IP», «Примечание»
          </p>
        </div>
      )}

      {columns.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-cyber-border text-xs uppercase tracking-wide text-slate-500">
                {columns.map((col) => (
                  <th key={col.id} className="group px-3 py-3 font-medium">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      {col.name}
                      <button
                        className="opacity-0 transition-opacity hover:text-cyan-300 group-hover:opacity-100"
                        title="Переименовать"
                        onClick={() => renameColumn(col)}
                      >
                        ✎
                      </button>
                      <button
                        className="opacity-0 transition-opacity hover:text-rose-400 group-hover:opacity-100"
                        title="Удалить колонку"
                        onClick={() => window.confirm(`Удалить колонку «${col.name}» и её данные?`) && deleteColumn(col)}
                      >
                        ✕
                      </button>
                    </div>
                  </th>
                ))}
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const dirty = !!edits[row.id];
                return (
                  <tr key={row.id} className="border-b border-cyber-border/50 last:border-0 hover:bg-slate-800/40">
                    {columns.map((col) => (
                      <td key={col.id} className="px-3 py-1.5">
                        <input
                          className={inputCls}
                          value={cellValue(row, col.id)}
                          onChange={(e) => setCell(row, col.id, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      {dirty && (
                        <button className="monitor-button mr-1.5 px-3 py-1.5 text-xs" onClick={() => saveRow(row)} disabled={busy}>
                          Сохранить
                        </button>
                      )}
                      <button
                        className="btn-ghost px-3 py-1.5 text-xs hover:border-rose-500/50 hover:text-rose-300"
                        onClick={() => window.confirm('Удалить строку?') && deleteRow(row)}
                      >
                        Удал.
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="px-5 py-10 text-center text-slate-500">
                    Строк нет — нажмите «+ Строка»
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
