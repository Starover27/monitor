/**
 * ServiceDetails — график времени отклика за 24 часа + лента проверок.
 * Экспортирует DetailsContent (общий), ServiceDetailsModal (модалка) и
 * ServiceDetailsPage (страница /service/:id).
 */
import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { useParams, Link } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import {
  historyUrl, servicesUrl, formatLatency, formatRelativeTime,
  effectiveStatus, SLOW_THRESHOLD_MS,
} from '../lib/api';

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded border border-cyber-border bg-cyber-panel px-3 py-2 text-xs font-mono shadow-lg">
      <div className="text-gray-400">{new Date(d.checked_at).toLocaleString()}</div>
      <div className={d.status === 'up' ? 'text-cyber-up' : 'text-cyber-down'}>
        status: {d.status} {d.latency_ms != null ? `· ${d.latency_ms}ms` : ''}
      </div>
      {d.error_message && (
        <div className="mt-1 max-w-[260px] break-words text-cyber-down">{d.error_message}</div>
      )}
    </div>
  );
}

function Stat({ label, value, className }) {
  return (
    <div className="rounded-lg border border-cyber-border bg-cyber-bg p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`font-mono text-lg font-bold ${className}`}>{value}</div>
    </div>
  );
}

const statusPill = (s) =>
  s === 'up'
    ? 'border-cyber-up text-cyber-up bg-cyber-up/10'
    : s === 'down'
    ? 'border-cyber-down text-cyber-down bg-cyber-down/10'
    : s === 'slow'
    ? 'border-cyber-slow text-cyber-slow bg-cyber-slow/10'
    : 'border-gray-600 text-gray-400';


export default function DetailsContent({ service }) {
  const { data: history, error, loading } = useFetch(historyUrl(service.id, 24), { interval: 10000 });

  const chartData = useMemo(() => {
    if (!Array.isArray(history)) return [];
    return [...history].reverse().map((h) => ({
      ...h,
      latency: h.status === 'up' ? h.latency_ms : null,
      time: new Date(h.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }));
  }, [history]);

  const stats = useMemo(() => {
    if (!Array.isArray(history) || history.length === 0) return null;
    const up = history.filter((h) => h.status === 'up').length;
    const uptime = ((up / history.length) * 100).toFixed(2);
    const lat = history.filter((h) => h.latency_ms != null).map((h) => h.latency_ms);
    const avg = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null;
    const max = lat.length ? Math.max(...lat) : null;
    return { uptime, avg, max, total: history.length, down: history.length - up };
  }, [history]);

  const st = effectiveStatus(service);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-mono text-xl font-bold text-white">{service.name}</h2>
          <p className="text-sm text-gray-400">{service.target} · {service.check_type ?? 'http'}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-mono font-bold uppercase tracking-wider ${statusPill(st)}`}>
          {st}
        </span>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Uptime 24h" value={`${stats.uptime}%`} className="text-cyber-up" />
          <Stat label="Avg latency" value={formatLatency(stats.avg)} className="text-white" />
          <Stat label="Max latency" value={formatLatency(stats.max)} className="text-cyber-slow" />
          <Stat label="Checks" value={`${stats.total} (${stats.down} down)`} className="text-white" />
        </div>
      )}

      <div className="rounded-lg border border-cyber-border bg-cyber-bg p-4">
        <h3 className="mb-3 font-mono text-sm font-semibold text-gray-300">
          Время отклика — последние 24 часа
        </h3>
        {loading && <div className="py-12 text-center text-sm text-gray-500">Загрузка истории…</div>}
        {error && <div className="py-6 text-center text-sm text-cyber-down">Ошибка: {error}</div>}
        {!loading && !error && chartData.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-500">Нет данных за 24 часа</div>
        )}
        {!loading && !error && chartData.length > 0 && (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="#1e2a3a" strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2a3a' }} minTickGap={24} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2a3a' }} unit="ms" width={50} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={SLOW_THRESHOLD_MS} stroke="#facc15" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="latency" stroke="#22d3ee" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 text-xs text-gray-500">
          Разрывы линии = DOWN. Жёлтый пунктир = порог degraded ({SLOW_THRESHOLD_MS}ms).
        </p>
      </div>

      {Array.isArray(history) && history.length > 0 && (
        <div className="rounded-lg border border-cyber-border bg-cyber-bg">
          <h3 className="border-b border-cyber-border px-4 py-2 font-mono text-sm font-semibold text-gray-300">
            Последние проверки
          </h3>
          <div className="max-h-48 divide-y divide-cyber-border/50 overflow-y-auto">
            {history.slice(0, 20).map((h) => (
              <div key={h.id} className="flex items-center justify-between px-4 py-2 text-xs font-mono">
                <span className={h.status === 'up' ? 'text-cyber-up' : 'text-cyber-down'}>
                  ● {h.status.toUpperCase()}
                </span>
                <span className="text-gray-400">{formatLatency(h.latency_ms)}</span>
                <span className="text-gray-500">{formatRelativeTime(h.checked_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ServiceDetailsModal({ service, onClose }) {
  if (!service) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-cyber-border bg-cyber-panel p-6 shadow-glow">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-cyber-border bg-cyber-bg px-2 py-1 text-sm text-gray-400 hover:text-white"
          aria-label="Закрыть"
        >
          ✕
        </button>
        <DetailsContent service={service} />
      </div>
    </div>
  );
}

export function ServiceDetailsPage() {
  const { id } = useParams();
  const serviceId = Number(id);
  const { data: services } = useFetch(servicesUrl(), { interval: 10000 });
  const service = Array.isArray(services) ? services.find((s) => s.id === serviceId) : null;

  if (!service) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Link to="/" className="text-sm text-cyber-up hover:underline">← Назад к дашборду</Link>
        <div className="mt-6 rounded-lg border border-cyber-border bg-cyber-panel p-8 text-center text-gray-400">
          {services ? `Сервис #${id} не найден` : 'Загрузка…'}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link to="/" className="text-sm text-cyber-up hover:underline">← Назад к дашборду</Link>
      <div className="mt-4 rounded-xl border border-cyber-border bg-cyber-panel p-6 shadow-glow">
        <DetailsContent service={service} />
      </div>
    </div>
  );
}


