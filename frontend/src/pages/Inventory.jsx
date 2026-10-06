/**
 * Inventory — состояние наблюдаемых клиентов:
 * сертификаты (сроки действия), диски, Windows-службы, расхождение времени
 * и панель поиска клиентов в сети (discovery).
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { API_BASE, formatBytes, formatRelativeTime } from '../lib/api';

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('ru-RU') : '—');
const daysLeft = (v) => Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
const certProgress = (cert) => {
  const start = new Date(cert.not_before).getTime();
  const end = new Date(cert.not_after).getTime();
  return Math.max(0, Math.min(100, ((Date.now() - start) / Math.max(1, end - start)) * 100));
};

const serviceState = (service) => (service.status === 'running' ? 'running' : service.status === 'stopped' ? 'stopped' : 'unknown');
const serviceLabel = (status) => ({ running: 'Запущен', stopped: 'Остановлен', unknown: 'Неизвестно' }[status] || 'Неизвестно');

/*
 * Статические карты классов. Tailwind JIT не генерирует классы, собранные
 * из переменных (`bg-${tone}-400`), поэтому все цвета прописаны литералами.
 */
const CERT_TONES = {
  expired: { badge: 'border-rose-500/40 bg-rose-500/10 text-rose-300', bar: 'bg-rose-400' },
  soon: { badge: 'border-amber-500/40 bg-amber-500/10 text-amber-300', bar: 'bg-amber-400' },
  ok: { badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', bar: 'bg-emerald-400' },
};

const DISK_TONES = {
  low: { text: 'text-rose-300', bar: 'bg-rose-400' },
  mid: { text: 'text-amber-300', bar: 'bg-amber-400' },
  high: { text: 'text-emerald-300', bar: 'bg-emerald-400' },
};

const SERVICE_STYLES = {
  running: { dot: 'bg-emerald-400', text: 'text-emerald-300' },
  stopped: { dot: 'bg-rose-400', text: 'text-rose-300' },
  unknown: { dot: 'bg-slate-500', text: 'text-slate-400' },
};

const certTone = (left) => {
  if (left < 0) return CERT_TONES.expired;
  if (left <= 30) return CERT_TONES.soon;
  return CERT_TONES.ok;
};

const diskTone = (freePercent) => {
  if (freePercent < 10) return DISK_TONES.low;
  if (freePercent < 25) return DISK_TONES.mid;
  return DISK_TONES.high;
};

function Progress({ value, barClass }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
      <div
        className={`h-full rounded-full transition-all duration-500 ${barClass}`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

const TABS = [
  ['certificates', 'Сертификаты'],
  ['disks', 'Диски'],
  ['services', 'Службы'],
  ['time', 'Время'],
];

/**
 * HostCard — карточка хоста на главной странице «Клиенты».
 * Показывает имя хоста, IP и время последней связи. Клик открывает
 * детальную страницу с сертификатами, дисками, службами и временем.
 */
function HostCard({ host, onOpen }) {
  const stale = Date.now() - new Date(host.received_at).getTime() > 120000;
  const online = !stale;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group relative w-full rounded-2xl border p-5 text-left bg-cyber-panel transition-all duration-200
        hover:-translate-y-0.5 hover:shadow-panel focus:outline-none focus:ring-2 focus:ring-cyan-400/40
        ${online ? 'border-emerald-500/40 bg-emerald-500/5 glow-up' : 'border-slate-600/60'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-white" title={host.hostname}>{host.hostname}</h3>
          <p className="mt-0.5 truncate font-mono text-xs text-slate-500">{host.addresses.join(', ')}</p>
        </div>
        <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
          {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-slate-500'}`} />
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/5 pt-3 text-xs">
        <span className={`font-semibold ${online ? 'text-emerald-300' : 'text-slate-400'}`}>
          {online ? 'На связи' : 'Нет связи'}
        </span>
        <div className="flex items-center gap-3 font-mono text-slate-500">
          <span>{host.services?.length || 0} служб</span>
          <span>{host.disks?.length || 0} дисков</span>
          <span>{formatRelativeTime(host.received_at)}</span>
        </div>
      </div>
    </button>
  );
}

export default function Inventory() {
  const { data, error, loading } = useFetch(`${API_BASE}/api/inventory`, { interval: 10000 });
  const navigate = useNavigate();
  const { hostId: routeHostId } = useParams();
  const [tab, setTab] = useState('certificates');
  const [folder, setFolder] = useState('');
  const hosts = Array.isArray(data)
    ? [...data].sort((a, b) => new Date(b.received_at) - new Date(a.received_at))
    : [];
  const host = routeHostId ? hosts.find((item) => item.host_id === routeHostId) : null;
  const certificates = useMemo(() => (host?.certificates || []).filter((cert) => {
    const normalize = (s) => s.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
    return !folder.trim() || normalize(cert.path).startsWith(`${normalize(folder.trim())}/`);
  }).sort((a, b) => new Date(a.not_after) - new Date(b.not_after)), [host, folder]);
  const stale = host && Date.now() - new Date(host.received_at).getTime() > 120000;
  const expiring = certificates.filter((c) => daysLeft(c.not_after) <= 30).length;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Заголовок + кнопка возврата к списку */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            {host ? host.hostname : 'Клиенты'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {host
              ? `${host.addresses.join(', ')} · сертификаты, диски, службы и время`
              : 'Нажмите на карточку хоста, чтобы увидеть сертификаты, диски, службы и время'}
          </p>
        </div>
        {host && (
          <button
            type="button"
            className="monitor-button"
            onClick={() => navigate('/inventory')}
          >
            ← Ко всем клиентам
          </button>
        )}
      </div>

      {/* Сетка карточек хостов — только когда не выбран конкретный хост */}
      {!host && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {hosts.map((item) => (
            <HostCard key={item.host_id} host={item} onOpen={() => navigate(`/inventory/${item.host_id}`)} />
          ))}
        </div>
      )}
      {!loading && !host && hosts.length === 0 && (
        <Empty text="Пока нет клиентов. Запустите MonitorClient.exe на наблюдаемой машине и укажите адрес и токен сервера." />
      )}

      {/* Скелетоны при первой загрузке */}
      {loading && !data && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-36" />)}
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300">
          Не удалось загрузить инвентаризацию: {error}
        </div>
      )}

      {host && (
        <div className="space-y-6">
          <div role="status" className={`text-sm ${stale ? 'text-amber-300' : 'text-slate-400'}`}>
            {stale ? 'Нет свежих данных — показан последний снимок' : 'Клиент передаёт данные'} · получено: {new Date(host.received_at).toLocaleString('ru-RU')}
          </div>

          {/* Сводка по клиенту */}
          <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Сертификаты" value={certificates.length} hint={`${expiring} требуют внимания`} />
            <Stat label="Диски" value={host.disks?.length || 0} hint="локальные тома" />
            <Stat label="Службы" value={host.services?.length || 0} hint="проверяются клиентом" />
            <Stat label="Расхождение времени" value={`${Math.round(Math.abs(host.clock_offset_seconds || 0))} с`} hint="клиент и сервер" />
          </section>

          {/* Табы */}
          <div className="flex flex-wrap gap-1 rounded-xl border border-cyber-border bg-cyber-panel/70 p-1" role="tablist">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  tab === key
                    ? 'bg-cyan-400/15 text-cyan-300'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'certificates' && (
            <section className="space-y-3">
              <input className="monitor-input w-full" aria-label="Папка сертификатов" placeholder="Фильтр по пути папки, включая подпапки" value={folder} onChange={(e) => setFolder(e.target.value)} />
              <p className="text-xs text-slate-500">
                Сканируются каталоги: {host.roots.join(', ') || 'не заданы'}. Список папок и служб можно менять в файле watchlist.txt рядом с клиентом — изменения подхватываются без перезапуска.
              </p>
              {certificates.length
                ? certificates.map((cert) => <Certificate key={`${cert.path}-${cert.fingerprint}-${cert.index}`} cert={cert} />)
                : <Empty text="Сертификаты не найдены в выбранных каталогах." />}
            </section>
          )}

          {tab === 'disks' && (
            <section className="grid gap-4 md:grid-cols-2">
              {(host.disks || []).map((disk) => <Disk key={disk.path} disk={disk} />)}
            </section>
          )}

          {tab === 'services' && (
            <section className="grid gap-3 md:grid-cols-2">
              {(host.services || []).map((service) => {
                const status = serviceState(service);
                const style = SERVICE_STYLES[status];
                return (
                  <div key={service.name} className="card p-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="min-w-0 truncate font-medium text-slate-100">{service.display_name || service.name}</span>
                      <span className={`inline-flex shrink-0 items-center gap-2 text-sm font-semibold ${style.text}`}>
                        <i className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                        {serviceLabel(status)}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-slate-500" title={service.name}>{service.name}</p>
                  </div>
                );
              })}
            </section>
          )}

          {tab === 'time' && (
            <section className="card p-6">
              <p className="text-sm text-slate-400">Последний снимок клиента</p>
              <p className="mt-2 text-3xl font-semibold text-white">{new Date(host.timestamp).toLocaleString('ru-RU')}</p>
              <p className={`mt-4 text-lg ${Math.abs(host.clock_offset_seconds || 0) > 30 ? 'text-amber-300' : 'text-emerald-400'}`}>
                Расхождение: {Number(host.clock_offset_seconds || 0).toFixed(1)} сек.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Это оценка разницы времени между клиентом и сервером, а не полноценная проверка NTP.
              </p>
            </section>
          )}

          {host.errors?.length > 0 && (
            <details className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
              <summary className="cursor-pointer">Предупреждения клиента ({host.errors.length})</summary>
              <ul className="mt-3 list-inside list-disc space-y-1 text-amber-300/80">
                {host.errors.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 font-mono text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function Empty({ text }) {
  return <div className="rounded-xl border border-dashed border-cyber-border p-10 text-center text-slate-500">{text}</div>;
}

function Certificate({ cert }) {
  const left = daysLeft(cert.not_after);
  const progress = certProgress(cert);
  const tone = certTone(left);
  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium text-white">{cert.name}</h2>
          <p className="mt-1 truncate text-xs text-slate-500" title={cert.path}>{cert.issuer} · {cert.path}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${tone.badge}`}>
          {left < 0 ? `Просрочен на ${Math.abs(left)} дн.` : `${left} дн. до окончания`}
        </span>
      </div>
      <div className="mt-5">
        <div className="mb-2 flex justify-between text-xs text-slate-500">
          <span>{fmtDate(cert.not_before)}</span>
          <span>{fmtDate(cert.not_after)}</span>
        </div>
        <Progress value={progress} barClass={tone.bar} />
      </div>
    </article>
  );
}

function Disk({ disk }) {
  const free = disk.total ? (disk.free / disk.total) * 100 : 0;
  const tone = diskTone(free);
  return (
    <article className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="truncate text-lg font-medium text-white">{disk.path}</h2>
        <b className={`shrink-0 font-mono text-sm font-semibold ${tone.text}`}>{free.toFixed(0)}% свободно</b>
      </div>
      <p className="mt-1 text-xs text-slate-500">{disk.filesystem || 'локальный диск'} · {formatBytes(disk.free)} из {formatBytes(disk.total)}</p>
      <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full transition-all duration-500 ${tone.bar}`} style={{ width: `${Math.min(100, 100 - free)}%` }} />
      </div>
      <div className="mt-2 text-right text-xs text-slate-500">занято {formatBytes(disk.used)}</div>
    </article>
  );
}
function DiscoveryPanel({ data, ranges, setRanges, enabled, setEnabled, message, setMessage }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const config = data?.config || {};
  ranges = ranges ?? (config.ranges || []).join('\n');
  enabled = enabled ?? Boolean(config.enabled);
  const running = Boolean(data?.running);
  const total = data?.total || 0;
  const checked = data?.checked || 0;
  const save = async (nextEnabled = enabled) => {
    setBusy(true);
    try {
    const list = ranges.split(/[\n,;]/).map((value) => value.trim()).filter(Boolean);
    const response = await fetch(`${API_BASE}/api/discovery`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Agent-Token': token }, body: JSON.stringify({ ranges: list, enabled: nextEnabled, interval_seconds: 300 }) });
    if (!response.ok) { const body = await response.json(); throw new Error(typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)); }
    setMessage('Диапазоны сохранены');
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  };
  const scan = async () => {
    setBusy(true);
    try {
    const response = await fetch(`${API_BASE}/api/discovery/scan`, { method: 'POST', headers: { 'X-Agent-Token': token } });
    setMessage(response.ok ? 'Сканирование поставлено в очередь' : `Не удалось запустить: HTTP ${response.status}`);
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  };
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Поиск клиентов в сетях</h2>
          <p className="mt-1 text-xs text-slate-500">
            Только частные IPv4-сети. Клиент отвечает на защищённый discovery-запрос, токен не передаётся.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            className="h-4 w-4 accent-cyan-400"
            checked={enabled}
            onChange={(event) => { setEnabled(event.target.checked); }}
          />
          автосканирование каждые 5 минут
        </label>
      </div>

      <textarea
        className="monitor-input mt-4 min-h-20 w-full font-mono text-sm"
        placeholder={'192.168.1.0/24\n10.10.20.0/24\n172.16.1.10-172.16.1.40'}
        aria-label="Диапазоны сетей для сканирования"
        value={ranges}
        onChange={(event) => setRanges(event.target.value)}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="password"
          className="monitor-input"
          aria-label="Токен управления сканированием"
          placeholder="SECRET_KEY (не сохраняется)"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button disabled={busy || running || !token} className="monitor-button" onClick={() => save()}>
          Сохранить диапазоны
        </button>
        <button className="btn-ghost" disabled={busy || running || !token} onClick={scan}>
          {running ? 'Сканирование…' : 'Сканировать сейчас'}
        </button>
        {message && <span className="text-sm text-slate-400" role="status">{message}</span>}
      </div>

      {running && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>Проверено адресов: {checked} / {total}</span>
            <span>{total ? Math.round((checked / total) * 100) : 0}%</span>
          </div>
          <Progress value={total ? (checked / total) * 100 : 0} barClass="bg-cyan-400" />
        </div>
      )}

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {(data?.results || []).map((item) => (
          <div key={`${item.host_id}-${item.ip}`} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm">
            <span className="font-medium text-emerald-300">Найден</span> {item.hostname}
            <span className="ml-2 text-slate-500">{item.ip}</span>
          </div>
        ))}
      </div>

      {data?.error && <p className="mt-3 text-sm text-rose-300">{data.error}</p>}
    </section>
  );
}