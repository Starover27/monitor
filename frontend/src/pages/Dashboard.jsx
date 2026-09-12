/**
 * Dashboard — главная страница с группировкой сервисов через drag-and-drop.
 * Группы визуально отделены, карточки можно перетаскивать между группами мышкой.
 */
import { useState, useMemo } from 'react';
import { useFetch } from '../hooks/useFetch';
import { servicesUrl, groupsUrl, saveGroup, effectiveStatus, patchService } from '../lib/api';
import ServiceCard from '../components/ServiceCard';
import { ServiceDetailsModal } from '../components/ServiceDetails';

export default function Dashboard() {
  const { data: services, error, loading, refetch } = useFetch(servicesUrl(), { interval: 10000 });
  const [selected, setSelected] = useState(null);
  const [dragged, setDragged] = useState(null);
  const [dropGroup, setDropGroup] = useState(null);
  const { data: savedGroups, error: groupsError, refetch: refetchGroups } = useFetch(groupsUrl());
  const [groupInput, setGroupInput] = useState('');
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const perform = async (action) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      await Promise.all([refetch(), refetchGroups()]);
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const summary = useMemo(() => {
    if (!Array.isArray(services)) return { up: 0, down: 0, slow: 0, unknown: 0 };
    const acc = { up: 0, down: 0, slow: 0, unknown: 0 };
    services.forEach((s) => { acc[effectiveStatus(s)] += 1; });
    return acc;
  }, [services]);

  const grouped = useMemo(() => {
    if (!Array.isArray(services)) return {};
    const g = Object.create(null);
    services.forEach((s) => {
      const key = s.group_name || '';
      (g[key] ||= []).push(s);
    });
    return g;
  }, [services]);

  const groupNames = Object.keys(grouped).sort((a, b) => {
    if (a === '') return 1;
    if (b === '') return -1;
    return a.localeCompare(b);
  });

  const onDragStart = (e, service) => {
    setDragged(service);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(service.id));
  };
  const onDragEnd = () => { setDragged(null); setDropGroup(null); };
  const onDragOver = (e, name) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropGroup(name); };
  const onDrop = async (e, name) => {
    e.preventDefault();
    setDropGroup(null);
    if (!dragged) return;
    const src = dragged.group_name || '';
    setDragged(null);
    if (src === name) return;
    await perform(() => patchService(dragged.id, { group_name: name || null }));
  };

  const renameGroup = async (oldName) => {
    const newName = (prompt(`Переименовать группу "${oldName}":`, oldName) || '').trim();
    if (!newName || newName === oldName) return;
    await perform(() => saveGroup('PATCH', oldName, newName));
  };
  const ungroupAll = async (name) => {
    if (!confirm(`Разгруппировать все сервисы из "${name}"?`)) return;
    await perform(() => saveGroup('DELETE', name));
  };
  const addGroup = (e) => {
    e.preventDefault();
    const name = groupInput.trim();
    if (!name) return;
    perform(async () => {
      await saveGroup('POST', name);
      setGroupInput('');
    });
  };
  const allGroups = [...new Set([...groupNames, ...(savedGroups || []), ''])].sort((a, b) => {
    if (a === '') return 1;
    if (b === '') return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="min-h-screen bg-cyber-bg">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-cyber-border bg-cyber-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap gap-4 items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded bg-gradient-to-br from-cyber-up to-cyan-600 shadow-glow" />
            <div>
              <h1 className="font-mono text-xl font-bold tracking-tight text-white">
                MONITOR<span className="text-cyber-up"> / </span>Обзор
              </h1>
              <p className="text-xs text-gray-400">Службы и инфраструктура · обновление каждые 10 секунд</p>
            </div>
          </div>

          {/* Сводка статусов */}
          <div className="flex items-center gap-4 font-mono text-sm">
            <SummaryPill color="text-cyber-up" dot="bg-cyber-up" label="UP" value={summary.up} />
            <SummaryPill color="text-cyber-slow" dot="bg-cyber-slow" label="SLOW" value={summary.slow} />
            <SummaryPill color="text-cyber-down" dot="bg-cyber-down" label="DOWN" value={summary.down} />
            <SummaryPill color="text-gray-300" dot="bg-gray-500" label="Нет данных" value={summary.unknown} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        <a href="/inventory" className="monitor-button inline-block">Клиенты · Сертификаты · Диски · Службы · Время →</a>
        <div className="overview-banner">
          <div>
            <p className="text-xs uppercase tracking-widest text-cyber-up">Центр мониторинга</p>
            <h2 className="mt-2 text-3xl font-semibold text-white">Всё под наблюдением</h2>
            <p className="mt-2 text-sm text-gray-400">Группируйте службы и отслеживайте их состояние в одном месте.</p>
          </div>
          <div className="text-right"><span className="text-4xl font-semibold text-white">{services?.length || 0}</span><p className="text-sm text-gray-400">служб в системе</p></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <input className="monitor-input" aria-label="Поиск служб" placeholder="Поиск по названию или адресу…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <form onSubmit={addGroup} className="flex flex-wrap gap-2">
            <input className="monitor-input" aria-label="Название новой группы" placeholder="Название новой группы" required maxLength={128} value={groupInput} onChange={(e) => setGroupInput(e.target.value)} />
            <button className="monitor-button" disabled={busy || !groupInput.trim()}>+ Создать группу</button>
          </form>
        </div>
        {(actionError || groupsError) && <div role="alert" className="rounded-lg border border-cyber-down bg-cyber-down/10 p-4 text-cyber-down">{actionError || `Не удалось загрузить группы: ${groupsError}`}</div>}
        {loading && !services && (
          <div className="py-20 text-center text-gray-500">Загрузка сервисов…</div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-cyber-down bg-cyber-down/10 px-4 py-3 text-sm text-cyber-down">
            ⚠ Не удалось подключиться к API: {error}. Повтор через 10s…
          </div>
        )}

        {Array.isArray(services) && services.length === 0 && (
          <div className="py-20 text-center text-gray-500">
            Нет зарегистрированных сервисов. Запустите агент, чтобы они появились.
          </div>
        )}

        {Array.isArray(services) &&
          allGroups.map((name) => {
            const items = (grouped[name] || []).filter((s) => `${s.name} ${s.target}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
            const isUngrouped = name === '';
            const isDropTarget = dropGroup === name;
            return (
              <section
                key={name || '__ungrouped__'}
                onDragOver={(e) => onDragOver(e, name)}
                onDragLeave={() => setDropGroup(null)}
                onDrop={(e) => onDrop(e, name)}
                className={`group-panel rounded-xl border p-5 transition-colors ${
                  isDropTarget
                    ? 'border-cyber-up bg-cyber-up/5'
                    : isUngrouped
                    ? 'border-transparent'
                    : 'border-cyber-border/60 bg-cyber-panel/30'
                }`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-gray-400">
                    {isUngrouped ? '◇ Без группы' : `▣ ${name}`}
                    <span className="ml-2 text-gray-600">({items.length})</span>
                  </h2>
                  {!isUngrouped && (
                    <div className="flex gap-1.5">
                      <button
                        disabled={busy}
                        onClick={() => renameGroup(name)}
                        className="rounded border border-cyber-border px-2 py-1 text-xs text-gray-400 hover:text-white"
                        title="Переименовать группу"
                      >
                        ✎ переименовать
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => ungroupAll(name)}
                        className="rounded border border-cyber-border px-2 py-1 text-xs text-gray-400 hover:text-cyber-down"
                        title="Открепить все карточки из группы"
                      >
                        ✕ удалить группу
                      </button>
                    </div>
                  )}
                </div>

                {items.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-600">
                    {search ? 'Нет служб по вашему запросу' : 'Перетащите сюда службу или выберите группу под её карточкой'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {items.map((service) => (
                      <div
                        key={service.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, service)}
                        onDragEnd={onDragEnd}
                        className={`cursor-grab active:cursor-grabbing ${
                          dragged?.id === service.id ? 'opacity-40' : ''
                        }`}
                      >
                        <ServiceCard service={service} onClick={setSelected} />
                        <select
                          className="monitor-input mt-3 w-full text-xs"
                          aria-label={`Группа службы ${service.name}`}
                          value={service.group_name || ''}
                          disabled={busy}
                          onChange={(e) => perform(() => patchService(service.id, { group_name: e.target.value || null }))}
                        >
                          {allGroups.map((group) => <option key={group} value={group}>{group || 'Без группы'}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
      </main>

      {/* Модальное окно с графиком */}
      {selected && (
        <ServiceDetailsModal service={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function SummaryPill({ color, dot, label, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="text-gray-500">{label}</span>
      <span className={`font-bold ${color}`}>{value}</span>
    </div>
  );
}
