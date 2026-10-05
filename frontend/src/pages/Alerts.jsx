/**
 * Alerts — лог инцидентов (GET /api/alerts).
 * Показывает историю алертов с фильтром по состоянию и severity.
 */
import { useMemo, useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import {
  alertsUrl,
  formatDateTime,
  formatRelativeTime,
} from '../lib/api';

const FILTERS = [
  { key: 'open', label: 'Открытые' },
  { key: 'all', label: 'Все' },
  { key: 'resolved', label: 'Закрытые' },
];

const SEVERITY_STYLES = {
  critical: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  info: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
};

const SEVERITY_LABELS = {
  critical: 'Критично',
  warning: 'Внимание',
  info: 'Инфо',
};

export default function Alerts() {
  const { data, error, loading, lastUpdated } = useFetch(alertsUrl(200), { interval: 10000 });
  const [filter, setFilter] = useState('open');

  const alerts = useMemo(() => {
    if (!Array.isArray(data)) return [];
    if (filter === 'open') return data.filter((a) => !a.is_resolved);
    if (filter === 'resolved') return data.filter((a) => a.is_resolved);
    return data;
  }, [data, filter]);

  const openCount = useMemo(
    () => (Array.isArray(data) ? data.filter((a) => !a.is_resolved).length : 0),
    [data],
  );

  return (
    <div className="animate-fade-in space-y-6">
      {/* Заголовок */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Инциденты</h1>
          <p className="mt-1 text-sm text-slate-500">
            {openCount > 0
              ? `Открытых инцидентов: ${openCount}`
              : 'Открытых инцидентов нет — всё в порядке'}
            {lastUpdated && ` · обновлено ${formatRelativeTime(new Date(lastUpdated).toISOString())}`}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-cyber-border bg-cyber-panel/70 p-1">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                filter === key
                  ? 'bg-cyan-400/15 text-cyan-300'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">
          Не удалось загрузить инциденты: {error}. Повтор через 10 секунд…
        </div>
      )}

      {/* Скелетоны при первой загрузке */}
      {loading && !data && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-16 w-full" />
          ))}
        </div>
      )}

      {/* Пустые состояния */}
      {!loading && !error && alerts.length === 0 && (
        <div className="card p-14 text-center">
          <p className="text-lg font-medium text-slate-300">
            {filter === 'open' ? 'Открытых инцидентов нет' : 'Инцидентов не найдено'}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Алерты создаются автоматически после серии неудачных проверок подряд.
          </p>
        </div>
      )}

      {/* Список инцидентов */}
      <div className="space-y-3">
        {alerts.map((alert) => {
          const severity = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info;
          return (
            <article
              key={alert.id}
              className={`card flex flex-wrap items-center gap-x-6 gap-y-3 p-5 ${alert.is_resolved ? 'opacity-60' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-semibold text-white">
                    {alert.service_name || `Сервис #${alert.service_id}`}
                  </span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${severity}`}>
                    {SEVERITY_LABELS[alert.severity] || alert.severity}
                  </span>
                  {alert.is_resolved ? (
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                      Закрыт {alert.resolved_at ? formatRelativeTime(alert.resolved_at) : ''}
                    </span>
                  ) : (
                    <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-300">
                      Активен
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm text-slate-400">{alert.message}</p>
                <p className="mt-1 truncate font-mono text-xs text-slate-600" title={alert.service_target}>
                  {alert.service_target}
                </p>
              </div>
              <time className="text-xs text-slate-500" title={formatDateTime(alert.created_at)}>
                {formatRelativeTime(alert.created_at)}
              </time>
            </article>
          );
        })}
      </div>
    </div>
  );
}
