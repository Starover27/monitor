import { useMemo, useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { API_BASE } from '../lib/api';

const fmtBytes = (n) => {
  if (!Number.isFinite(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n; let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
};
const fmtDate = (v) => v ? new Date(v).toLocaleDateString('ru-RU') : '—';
const daysLeft = (v) => Math.ceil((new Date(v).getTime() - Date.now()) / 86400000);
const certProgress = (cert) => {
  const start = new Date(cert.not_before).getTime();
  const end = new Date(cert.not_after).getTime();
  return Math.max(0, Math.min(100, ((Date.now() - start) / Math.max(1, end - start)) * 100));
};
const serviceState = (service) => service.status === 'running' ? 'running' : service.status === 'stopped' ? 'stopped' : 'unknown';
const serviceLabel = (status) => ({ running: 'Запущен', stopped: 'Остановлен', unknown: 'Неизвестно' }[status] || 'Неизвестно');

function Progress({ value, tone = 'cyan' }) {
  return <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className={`h-full rounded-full bg-${tone}-400 transition-all`} style={{ width: `${value}%` }} /></div>;
}

export default function Inventory() {
  const { data, error, loading } = useFetch(`${API_BASE}/api/inventory`, { interval: 10000 });
  const discovery = useFetch(`${API_BASE}/api/discovery`, { interval: 3000 });
  const [hostId, setHostId] = useState('');
  const [tab, setTab] = useState('certificates');
  const [ip, setIp] = useState('');
  const [folder, setFolder] = useState('');
  const [ranges, setRanges] = useState(null);
  const [scanEnabled, setScanEnabled] = useState(null);
  const [scanMessage, setScanMessage] = useState('');
  const hosts = Array.isArray(data) ? data : [];
  const matchingHosts = hosts.filter((item) => !ip.trim() || item.addresses.includes(ip.trim()) || item.hostname.toLowerCase().includes(ip.trim().toLowerCase()));
  const host = matchingHosts.find((item) => item.host_id === hostId) || matchingHosts[0];
  const certificates = useMemo(() => (host?.certificates || []).filter((cert) => {
    const normalize = (s) => s.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
    return !folder.trim() || normalize(cert.path).startsWith(`${normalize(folder.trim())}/`);
  }).sort((a, b) => new Date(a.not_after) - new Date(b.not_after)), [host, folder]);
  const stale = host && Date.now() - new Date(host.received_at).getTime() > 120000;
  const expiring = certificates.filter((c) => daysLeft(c.not_after) <= 30).length;

  return <div className="min-h-screen bg-cyber-bg text-slate-100">
    <header className="border-b border-cyber-border bg-slate-950/70 px-6 py-5 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <div><p className="text-xs uppercase tracking-[.25em] text-cyan-400">Monitor / inventory</p><h1 className="mt-1 text-2xl font-semibold">Состояние инфраструктуры</h1></div>
        <select className="monitor-input min-w-64" value={host?.host_id || ''} onChange={(e) => setHostId(e.target.value)}>
          {!hosts.length && <option value="">Нет подключённых клиентов</option>}
          {matchingHosts.map((item) => <option key={item.host_id} value={item.host_id}>{item.hostname} · {item.addresses.join(', ')}</option>)}
        </select>
      </div>
    </header>
    <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center gap-4"><a href="/" className="text-sm text-cyan-300">← Обзор и история</a><input className="monitor-input" aria-label="IP или имя компьютера" placeholder="IP или имя компьютера" value={ip} onChange={(e) => setIp(e.target.value)} /></div>
      <p className="text-sm text-slate-500">По IP выбирается уже подключённый клиент. Запустите start-client.cmd на нужном компьютере; удалённый доступ к дискам не требуется.</p>
      {!loading && !host && <Empty text={ip ? 'Нет подключённого клиента с таким IP или именем.' : 'Пока нет клиентов. Запустите Windows-клиент и укажите адрес и токен сервера.'} />}
      {loading && !data && <div className="rounded-2xl border border-cyber-border p-12 text-center text-slate-400">Ожидание данных от Windows-клиента…</div>}
      {error && <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-300">Не удалось загрузить инвентаризацию: {error}</div>}
      <DiscoveryPanel data={discovery.data} ranges={ranges} setRanges={setRanges} enabled={scanEnabled} setEnabled={setScanEnabled} message={scanMessage} setMessage={setScanMessage} />
      {host && <>
        <div role="status" className={stale ? 'text-amber-300' : 'text-slate-400'}>{stale ? 'Нет свежих данных — показан последний снимок' : 'Клиент передаёт данные'} · Получено: {new Date(host.received_at).toLocaleString('ru-RU')}</div>
        <section className="grid gap-4 md:grid-cols-4">
          <Stat label="Сертификаты" value={certificates.length} hint={`${expiring} требуют внимания`} />
          <Stat label="Диски" value={host.disks?.length || 0} hint="локальные тома" />
          <Stat label="Службы" value={host.services?.length || 0} hint="проверяются клиентом" />
          <Stat label="Время клиента" value={`${Math.round(Math.abs(host.clock_offset_seconds || 0))}с`} hint="расхождение с сервером" />
        </section>
        <div className="flex flex-wrap gap-2 rounded-xl border border-cyber-border bg-slate-900/60 p-2">
          {[['certificates', 'Сертификаты'], ['disks', 'Диски'], ['services', 'Службы'], ['time', 'Время']].map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`rounded-lg px-4 py-2 text-sm ${tab === key ? 'bg-cyan-400 font-semibold text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>{label}</button>)}
        </div>
        {tab === 'certificates' && <section className="space-y-3"><input className="monitor-input w-full" aria-label="Папка сертификатов" placeholder="Фильтр по пути папки, включая подпапки" value={folder} onChange={(e) => setFolder(e.target.value)} /><p className="text-xs text-slate-500">Сканируются каталоги: {host.roots.join(', ') || 'не заданы'}. Изменить корень: start-client.cmd --configure на клиенте.</p>{certificates.length ? certificates.map((cert) => <Certificate key={`${cert.path}-${cert.fingerprint}-${cert.index}`} cert={cert} />) : <Empty text="Сертификаты не найдены в выбранных каталогах." />}</section>}
        {tab === 'disks' && <section className="grid gap-4 md:grid-cols-2">{(host.disks || []).map((disk) => <Disk key={disk.path} disk={disk} />)}</section>}
        {tab === 'services' && <section className="grid gap-3 md:grid-cols-2">{(host.services || []).map((service) => { const status = serviceState(service); return <div key={service.name} className="rounded-xl border border-cyber-border bg-slate-900/70 p-4"><div className="flex items-center justify-between gap-4"><span>{service.display_name || service.name}</span><span className={`inline-flex items-center gap-2 font-semibold ${status === 'running' ? 'text-emerald-400' : status === 'stopped' ? 'text-rose-400' : 'text-slate-400'}`}><i className={`h-2.5 w-2.5 rounded-full ${status === 'running' ? 'bg-emerald-400' : status === 'stopped' ? 'bg-rose-400' : 'bg-slate-500'}`} />{serviceLabel(status)}</span></div><p className="mt-1 text-xs text-slate-500">{service.name}</p></div>; })}</section>}
        {tab === 'time' && <section className="rounded-2xl border border-cyber-border bg-slate-900/70 p-6"><p className="text-sm text-slate-400">Последний снимок</p><p className="mt-2 text-3xl font-semibold">{new Date(host.timestamp).toLocaleString('ru-RU')}</p><p className={`mt-4 text-lg ${(Math.abs(host.clock_offset_seconds || 0) > 30) ? 'text-amber-300' : 'text-emerald-400'}`}>Расхождение: {Number(host.clock_offset_seconds || 0).toFixed(1)} сек.</p><p className="mt-2 text-sm text-slate-500">Это оценка разницы времени между клиентом и сервером, а не полноценная проверка NTP.</p></section>}
        {host.errors?.length > 0 && <details className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200"><summary>Предупреждения клиента ({host.errors.length})</summary><ul className="mt-3 list-inside list-disc space-y-1 text-amber-300/80">{host.errors.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
      </>}
    </main>
  </div>;
}

function Stat({ label, value, hint }) { return <div className="rounded-2xl border border-cyber-border bg-slate-900/70 p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div>; }
function Empty({ text }) { return <div className="rounded-xl border border-dashed border-cyber-border p-10 text-center text-slate-500">{text}</div>; }
function Certificate({ cert }) { const left = daysLeft(cert.not_after); const progress = certProgress(cert); const tone = left < 0 ? 'rose' : left <= 30 ? 'amber' : 'cyan'; return <article className="rounded-2xl border border-cyber-border bg-slate-900/70 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-medium text-white">{cert.name}</h2><p className="mt-1 text-xs text-slate-500">{cert.issuer} · {cert.path}</p></div><span className={`rounded-full bg-${tone}-400/10 px-3 py-1 text-sm text-${tone}-300`}>{left < 0 ? `Просрочен на ${Math.abs(left)} дн.` : `${left} дн. осталось`}</span></div><div className="mt-5"><div className="mb-2 flex justify-between text-xs text-slate-500"><span>{fmtDate(cert.not_before)}</span><span>{fmtDate(cert.not_after)}</span></div><Progress value={progress} tone={tone} /></div></article>; }
function Disk({ disk }) { const free = disk.total ? (disk.free / disk.total) * 100 : 0; const tone = free < 10 ? 'rose' : free < 25 ? 'amber' : 'emerald'; return <article className="rounded-2xl border border-cyber-border bg-slate-900/70 p-5"><div className="flex justify-between"><h2 className="text-lg font-medium">{disk.path}</h2><b className={`text-${tone}-300`}>{free.toFixed(0)}% свободно</b></div><p className="mt-1 text-xs text-slate-500">{disk.filesystem || 'локальный диск'} · {fmtBytes(disk.free)} из {fmtBytes(disk.total)}</p><div className="mt-5 h-4 overflow-hidden rounded-full bg-slate-800"><div className={`h-full bg-${tone}-400`} style={{ width: `${100 - free}%` }} /></div><div className="mt-2 text-right text-xs text-slate-500">занято {fmtBytes(disk.used)}</div></article>; }
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
  return <section className="rounded-2xl border border-cyber-border bg-slate-900/70 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Поиск клиентов в сетях</h2><p className="mt-1 text-xs text-slate-500">Только частные IPv4-сети. Клиент отвечает на защищённый discovery-запрос, токен не передаётся.</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(event) => { setEnabled(event.target.checked); }} /> автосканирование каждые 5 минут</label></div><textarea className="monitor-input mt-4 min-h-20 w-full font-mono text-sm" placeholder={'192.168.1.0/24\n10.10.20.0/24\n172.16.1.10-172.16.1.40'} value={ranges} onChange={(event) => setRanges(event.target.value)} /><div className="mt-3 flex flex-wrap items-center gap-3"><input type="password" className="monitor-input" aria-label="Токен управления сканированием" placeholder="SECRET_KEY (не сохраняется)" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} /><button disabled={busy || running || !token} className="monitor-button" onClick={() => save()}>Сохранить диапазоны</button><button className="rounded-lg border border-cyan-400/40 px-4 py-2 text-sm text-cyan-300" disabled={busy || running || !token} onClick={scan}>{running ? 'Сканирование…' : 'Сканировать сейчас'}</button>{message && <span className="text-sm text-slate-400">{message}</span>}</div>{running && <div className="mt-4"><div className="mb-1 flex justify-between text-xs text-slate-500"><span>Проверено адресов: {checked} / {total}</span><span>{total ? Math.round(checked / total * 100) : 0}%</span></div><Progress value={total ? checked / total * 100 : 0} /></div>}<div className="mt-4 grid gap-2 md:grid-cols-2">{(data?.results || []).map((item) => <div key={`${item.host_id}-${item.ip}`} className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-sm"><span className="text-emerald-300">● найден</span> {item.hostname} <span className="text-slate-500">{item.ip}</span></div>)}</div>{data?.error && <p className="mt-3 text-sm text-rose-300">{data.error}</p>}</section>;
}