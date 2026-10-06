/**
 * Dashboard — главная страница: карточки хостов (имя + IP).
 * Клик по карточке открывает страницу клиента с сертификатами, дисками, службами и временем.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { API_BASE, formatRelativeTime } from '../lib/api';
import { getAuth } from '../lib/portal-auth';

const ONLINE_MS = 120000; // свежесть снимка инвентаризации

// Основной IP: предпочитаем приватные IPv4 (192.168/10./172.16-31), исключая 127.*
function primaryIp(host) {
  const ips = host.addresses || [];
  const priv = ips.find((a) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a));
  return priv || ips.find((a) => a && !a.startsWith('127.')) || ips[0] || '—';
}

function HostCard({ host, onOpen }) {
  const online = Date.now() - new Date(host.received_at).getTime() <= ONLINE_MS;
  const styles = online
    ? { border: 'border-emerald-500/40', bg: 'bg-emerald-500/5', dot: 'bg-emerald-400', text: 'text-emerald-300', glow: 'glow-up' }
    : { border: 'border-slate-600/60', bg: '', dot: 'bg-slate-500', text: 'text-slate-400', glow: '' };
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative w-full rounded-2xl border p-5 text-left bg-cyber-panel transition-all duration-200
        hover:-translate-y-0.5 hover:shadow-panel focus:outline-none focus:ring-2 focus:ring-cyan-400/40
        ${styles.border} ${styles.bg} ${styles.glow}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-white" title={host.hostname}>{host.hostname}</h3>
          <p className="mt-0.5 truncate font-mono text-xs text-slate-500" title={(host.addresses || []).join(', ')}>
            {primaryIp(host)}
          </p>
        </div>
        <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
          {online && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${styles.dot}`} />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${styles.dot}`} />
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/5 pt-3 text-xs">
        <span className={`font-semibold ${styles.text}`}>{online ? 'На связи' : 'Нет связи'}</span>
        <div className="flex items-center gap-3 font-mono text-slate-500">
          <span>{host.services?.length || 0} служб</span>
          <span>{host.disks?.length || 0} дисков</span>
          <span>{formatRelativeTime(host.received_at)}</span>
        </div>
      </div>
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: hosts, error, loading, lastUpdated, refetch } = useFetch(`${API_BASE}/api/inventory`, { interval: 10000 });
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ host_id: '', hostname: '', addresses: '' });
  const [manualBusy, setManualBusy] = useState(false);
  const [manualMsg, setManualMsg] = useState(null);
  const list = useMemo(
    () => (Array.isArray(hosts) ? [...hosts].sort((a, b) => new Date(b.received_at) - new Date(a.received_at)) : []),
    [hosts],
  );
  const online = list.filter((h) => Date.now() - new Date(h.received_at).getTime() <= ONLINE_MS).length;

  const addManualAgent = async () => {
    setManualBusy(true);
    setManualMsg(null);
    try {
      const addresses = manualForm.addresses.split(',').map((s) => s.trim()).filter(Boolean);
      if (!manualForm.host_id.trim() || !manualForm.hostname.trim()) throw new Error('Укажите Host ID и имя хоста');
      const res = await fetch(`${API_BASE}/api/agent/manual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuth()?.token || ''}`,
        },
        body: JSON.stringify({ host_id: manualForm.host_id.trim(), hostname: manualForm.hostname.trim(), addresses }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      setManualMsg({ ok: true, text: `Хост «${manualForm.hostname}» добавлен в Клиенты.` });
      setManualForm({ host_id: '', hostname: '', addresses: '' });
      refetch();
    } catch (e) {
      setManualMsg({ ok: false, text: `Ошибка: ${e.message}` });
    } finally {
      setManualBusy(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Заголовок */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Хосты</h1>
          <p className="mt-1 text-sm text-slate-500">
            {list.length} клиентов · {online} на связи
            {lastUpdated && ` · обновлено ${formatRelativeTime(new Date(lastUpdated).toISOString())}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { setManualOpen((v) => !v); setManualMsg(null); }}
            className="monitor-button"
          >
            + Добавить агента вручную
          </button>
        </div>
      </div>

      {manualOpen && (
        <div className="card space-y-3 p-5">
          <p className="text-sm text-slate-400">
            Создаёт карточку в «Клиентах». Как только на этот хост поставят агент — данные начнут обновляться автоматически.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              className="monitor-input"
              placeholder="Host ID * (например office-pc-01)"
              value={manualForm.host_id}
              onChange={(e) => setManualForm((f) => ({ ...f, host_id: e.target.value }))}
            />
            <input
              className="monitor-input"
              placeholder="Имя хоста * (например KAB-101)"
              value={manualForm.hostname}
              onChange={(e) => setManualForm((f) => ({ ...f, hostname: e.target.value }))}
            />
            <input
              className="monitor-input"
              placeholder="IP через запятую (необязательно)"
              value={manualForm.addresses}
              onChange={(e) => setManualForm((f) => ({ ...f, addresses: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={addManualAgent} disabled={manualBusy} className="monitor-button">
              {manualBusy ? 'Добавляю…' : '＋ Добавить в клиенты'}
            </button>
            {manualMsg && (
              <span className={`text-sm ${manualMsg.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{manualMsg.text}</span>
            )}
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">
          Не удалось подключиться к API: {error}. Повтор через 10 секунд…
        </div>
      )}

      {/* Скелетоны при первой загрузке */}
      {loading && !hosts && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-36" />)}
        </div>
      )}

      {!loading && list.length === 0 && (
        <div className="card p-14 text-center">
          <p className="text-lg font-medium text-slate-300">Хостов пока нет</p>
          <p className="mt-2 text-sm text-slate-500">
            Запустите MonitorClient.exe на наблюдаемой машине — хосты появятся автоматически.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((host) => (
          <HostCard key={host.host_id} host={host} onOpen={() => navigate(`/inventory/${host.host_id}`)} />
        ))}
      </div>
    </div>
  );
}
