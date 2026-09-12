/**
 * ServiceCard — карточка одного сервиса в grid.
 * Показывает: имя, target (IP/URL), статус-индикатор, метрику или latency и время последней проверки.
 */
import {
  effectiveStatus,
  statusColors,
  statusBgColors,
  statusGlows,
  formatRelativeTime,
  formatLatency,
  isMetricType,
  formatMetric,
} from '../lib/api';

const STATUS_LABEL = {
  up: 'UP',
  down: 'DOWN',
  slow: 'DEGRADED',
  unknown: 'UNKNOWN',
};

export default function ServiceCard({ service, onClick }) {
  const status = effectiveStatus(service);
  const isMetric = isMetricType(service.check_type);
  const metricText = isMetric ? formatMetric(service.last_metric_value, service.metric_unit) : null;

  return (
    <button
      type="button"
      onClick={() => onClick(service)}
      className={`group relative w-full text-left rounded-lg border ${statusBgColors[status]} ${statusGlows[status]}
        bg-cyber-panel p-5 transition-all duration-200 hover:scale-[1.02] hover:${statusGlows[status]}
        focus:outline-none focus:ring-2 focus:ring-cyber-up/50 scanline`}
    >
      {/* Верхняя строка: имя + пульсирующий индикатор */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-mono text-lg font-semibold text-gray-100">
            {service.name}
          </h3>
          <p className="truncate text-sm text-gray-400">{service.target}</p>
        </div>

        <span className="relative flex h-3 w-3 shrink-0 mt-1.5">
          {status !== 'unknown' && (
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${
                status === 'up'
                  ? 'bg-cyber-up'
                  : status === 'down'
                  ? 'bg-cyber-down'
                  : 'bg-cyber-slow'
              }`}
            />
          )}
          <span
            className={`relative inline-flex h-3 w-3 rounded-full ${
              status === 'up'
                ? 'bg-cyber-up'
                : status === 'down'
                ? 'bg-cyber-down'
                : status === 'slow'
                ? 'bg-cyber-slow'
                : 'bg-gray-500'
            }`}
          />
        </span>
      </div>

      {/* Нижняя строка: статус, метрика/latency, время */}
      <div className="mt-4 flex items-center justify-between text-xs">
        <span className={`font-mono font-bold uppercase tracking-wider ${statusColors[status]}`}>
          {STATUS_LABEL[status]}
        </span>
        <div className="flex items-center gap-3 text-gray-400 font-mono">
          {isMetric && metricText ? (
            <span className="text-gray-200 font-bold" title="Значение метрики">
              📊 {metricText}
            </span>
          ) : (
            <span title="Время отклика">⚡ {formatLatency(service.last_latency_ms)}</span>
          )}
          <span title="Последняя проверка">🕐 {formatRelativeTime(service.last_checked_at)}</span>
        </div>
      </div>
    </button>
  );
}
