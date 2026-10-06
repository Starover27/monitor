/**
 * Scanner — отдельная страница сканирования сети (только админы).
 * Вместо встроенного сканера в деталке хоста.
 */
import { useState } from 'react';
import { authFetch, getAuth } from '../lib/portal-auth';
import { API_BASE } from '../lib/api';

const INPUT_CLS = 'monitor-input';

export default function Scanner() {
  const [ranges, setRanges] = useState('192.168.1.0/24\n10.10.20.0/24');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [status, setStatus] = useState(null);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    setStatus(null);
    try {
      const list = ranges.split('\n').map(s => s.trim()).filter(Boolean);
      if (!list.length) throw new Error('Укажите хотя бы один диапазон');
      const res = await authFetch(`${API_BASE}/api/discovery/admin-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ranges: list }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`);
      setMsg({ ok: true, text: `Сканирование запущено: ${list.length} диапазон(ов)` });
      poll();
    } catch (e) {
      setMsg({ ok: false, text: `Ошибка: ${e.message}` });
    } finally {
      setBusy(false);
    }
  };

  const poll = async () => {
    const tick = async () => {
      try {
        const s = await authFetch(`${API_BASE}/api/discovery`);
        setStatus(typeof s === 'object' ? s : null);
        if (s && s.running) {
          setTimeout(tick, 1000);
        }
      } catch {
        setTimeout(tick, 2000);
      }
    };
    tick();
  };

  const addAgent = async (item) => {
    try {
      const addresses = [item.ip];
      const res = await authFetch(`${API_BASE}/api/agent/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_id: item.host_id, hostname: item.hostname, addresses }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`);
      setMsg({ ok: true, text: `Добавлен: ${item.hostname} (${item.ip})` });
    } catch (e) {
      setMsg({ ok: false, text: `Ошибка добавления ${item.hostname}: ${e.message}` });
    }
  };

  return (
    <div className="animate-fade-in mx-auto max-w-4xl space-y-6">
      <div className="card p-6">
        <h1 className="text-xl font-bold text-white">Сканер хостов</h1>
        <p className="mt-2 text-sm text-slate-400">
          Укажите диапазоны IPv4 (частные сети 10/8, 172.16/12, 192.168/16). Можно несколько строк: CIDR <code className="text-cyan-300">192.168.1.0/24</code> или диапазон <code className="text-cyan-300">192.168.1.10-192.168.1.40</code>.
        </p>
        <label className="block mt-4">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Диапазоны для сканирования (по одному в строке)</span>
          <textarea
            className={INPUT_CLS}
            rows={4}
            value={ranges}
            onChange={(e) => setRanges(e.target.value)}
            placeholder={'192.168.1.0/24\n10.10.20.0/24\n192.168.1.10-192.168.1.40'}
          />
        </label>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={run} disabled={busy} className="monitor-button">
            {busy ? 'Сканирую…' : '🔍 Сканировать'}
          </button>
          {msg && <span className={`text-sm ${msg.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</span>}
        </div>

        {status && (
          <div className="mt-4 space-y-3">
            {status.running && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>Проверено: {status.checked || 0} / {status.total || 0}</span>
                  <span>{status.total ? Math.round(((status.checked || 0) / status.total) * 100) : 0}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-cyan-400 transition-all duration-500"
                    style={{ width: `${status.total ? ((status.checked || 0) / status.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
            {(status.results || []).length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-300">Найдены агенты:</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {(status.results || []).map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium text-emerald-300">{item.hostname}</span>
                        <span className="ml-2 text-slate-500">{item.ip}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => addAgent(item)}
                        className="shrink-0 rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/30"
                      >
                        ＋ В клиенты
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {status.finished_at && (
              <p className="text-xs text-slate-500">
                Завершено: {new Date(status.finished_at).toLocaleString('ru-RU')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
