/**
 * ServiceCard — карточка одного сервиса в grid.
 * Показывает: имя, target (IP/URL), статус-индикатор, метрику или latency
 * и время последней проверки. Клик открывает детали с графиком.
 */
import {
  effectiveStatus,
  statusStyles,
  STATUS_LABELS,
  formatRelativeTime,
  formatLatency,
  isMetricType,
  formatMetric,
} from '../lib/api';

export default function ServiceCard({ service, onClick }) {
  const status = effectiveStatus(service);
  const style = statusStyles[status];
  const isMetric = isMetricType(service.check_type);
  const metricText = isMetric ? formatMetric(service.last_metric_value, service.metric_unit) : null;

  return (
    <button
      type="button"
      onClick={() => onClick(service)}
      className={`group relative w-full rounded-2xl border p-5 text-left ${style.bgSoft} ${style.border} ${style.glow}
        bg-cyber-panel transition-all duration-200 hover:-translate-y-0.5 hover:shadow-panel
        focus:outline-none focus:ring-2 focus:ring-cyan-400/40`}
    >
      {/* Верхняя строка: имя + пульсирующий индикатор */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-white" title={service.name}>
            {service.name}
          </h3>
          <p className="mt-0.5 truncate font-mono text-xs text-slate-500" title={service.target}>
            {service.target}
          </p>
        </div>

        <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
          {status !== 'unknown' && (
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${style.dot}`}
            />
          )}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${style.dot}`} />
        </span>
      </div>

      {/* Нижняя строка: статус, метрика/latency, время */}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/5 pt-3">
        <span className={`text-xs font-semibold ${style.text}`}>
          {STATUS_LABELS[status]}
        </span>
        <div className="flex items-center gap-3 font-mono text-xs text-slate-400">
          {isMetric && metricText ? (
            <span className="font-semibold text-slate-200" title="Значение метрики">
              {metricText}
            </span>
          ) : (
            <span title="Время отклика">{formatLatency(service.last_latency_ms)}</span>
          )}
          <span title="Последняя проверка">{formatRelativeTime(service.last_checked_at)}</span>
        </div>
      </div>
    </button>
  );
}

