/**
 * ServiceDetails — график времени отклика за 24 часа + лента проверок.
 * Экспортирует DetailsContent (общий), ServiceDetailsModal (модалка) и
 * ServiceDetailsPage (страница /service/:id).
 */
import { useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { useParams, Link } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import {
  historyUrl, servicesUrl, formatLatency, formatRelativeTime,
  effectiveStatus, SLOW_THRESHOLD_MS, statusStyles, STATUS_LABELS,
} from '../lib/api';

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="card px-3 py-2 text-xs shadow-panel">
      <div className="text-slate-500">{new Date(d.checked_at).toLocaleString('ru-RU')}</div>
      <div className={d.status === 'up' ? 'text-emerald-300' : 'text-rose-300'}>
        {d.status === 'up' ? 'Работает' : 'Недоступен'}
        {d.latency_ms != null ? ` · ${d.latency_ms} мс` : ''}
      </div>
      {d.error_message && (
        <div className="mt-1 max-w-[260px] break-words text-rose-300">{d.error_message}</div>
      )}
    </div>
  );
}

function Stat({ label, value, className }) {
  return (
    <div className="rounded-xl border border-cyber-border bg-slate-900/50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 font-mono text-lg font-bold ${className}`}>{value}</div>
    </div>
  );
}

const statusPill = (s) => {
  const st = statusStyles[s];
  return `${st.border} ${st.text} ${st.bgSoft}`;
};


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
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-white">{service.name}</h2>
          <p className="mt-0.5 truncate font-mono text-sm text-slate-500" title={service.target}>
            {service.target} · {service.check_type ?? 'http'}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-3.5 py-1 text-xs font-semibold ${statusPill(st)}`}>
          {STATUS_LABELS[st]}
        </span>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Доступность, 24 ч" value={`${stats.uptime}%`} className="text-emerald-300" />
          <Stat label="Средний отклик" value={formatLatency(stats.avg)} className="text-white" />
          <Stat label="Макс. отклик" value={formatLatency(stats.max)} className="text-amber-300" />
          <Stat label="Проверок (падений)" value={`${stats.total} (${stats.down})`} className="text-white" />
        </div>
      )}

      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">
          Время отклика — последние 24 часа
        </h3>
        {loading && (
          <div className="flex justify-center py-12">
            <div className="skeleton h-40 w-3/4" />
          </div>
        )}
        {error && <div className="py-6 text-center text-sm text-rose-300">Ошибка: {error}</div>}
        {!loading && !error && chartData.length === 0 && (
          <div className="py-12 text-center text-sm text-slate-500">Нет данных за 24 часа</div>
        )}
        {!loading && !error && chartData.length > 0 && (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="#1e2a3d" strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2a3d' }} minTickGap={24} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#1e2a3d' }} unit=" мс" width={54} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={SLOW_THRESHOLD_MS} stroke="#fbbf24" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="latency" stroke="#34d399" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Разрывы линии — недоступность. Жёлтый пунктир — порог «медленно» ({SLOW_THRESHOLD_MS} мс).
        </p>
      </div>

      {Array.isArray(history) && history.length > 0 && (
        <div className="card overflow-hidden">
          <h3 className="border-b border-cyber-border px-4 py-2.5 text-sm font-semibold text-slate-300">
            Последние проверки
          </h3>
          <div className="max-h-48 divide-y divide-cyber-border/50 overflow-y-auto">
            {history.slice(0, 20).map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3 px-4 py-2 font-mono text-xs">
                <span className={h.status === 'up' ? 'text-emerald-300' : 'text-rose-300'}>
                  {h.status === 'up' ? 'Работает' : 'Недоступен'}
                </span>
                <span className="text-slate-400">{formatLatency(h.latency_ms)}</span>
                <span className="text-slate-500">{formatRelativeTime(h.checked_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ServiceDetailsModal({ service, onClose }) {
  // Закрытие по Escape + блокировка прокрутки фона, пока модалка открыта
  useEffect(() => {
    if (!service) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [service, onClose]);

  if (!service) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Детали службы ${service.name}`}
    >
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="card animate-fade-in relative max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg border border-cyber-border bg-slate-900/70 px-2.5 py-1 text-xs text-slate-400 transition-colors hover:text-white"
          aria-label="Закрыть"
        >
          Закрыть
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
      <div className="animate-fade-in mx-auto max-w-3xl">
        <Link to="/" className="link text-sm">← Назад к обзору</Link>
        <div className="card mt-4 p-8 text-center text-slate-400">
          {services ? `Служба #${id} не найдена` : 'Загрузка…'}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in mx-auto max-w-3xl">
      <Link to="/" className="link text-sm">← Назад к обзору</Link>
      <div className="card mt-4 p-6">
        <DetailsContent service={service} />
      </div>
    </div>
  );
}


