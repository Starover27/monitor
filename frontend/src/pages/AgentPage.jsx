/**
 * AgentPage — «Агент» в разделе Мониторинга (тёмная тема, только для админов).
 * Форма сборки клиента: адрес сервера, host_id, интервалы, инвентаризация,
 * ретраи/таймауты, логирование, порт разведки, список проверок.
 * Кнопка «Собрать build» скачивает zip: если собран agent/dist/MonitorClient.exe —
 * готовый exe (Python на целевом ПК не нужен), иначе исходники + скрипты.
 */
import { useState } from 'react';
import { authFetch, getAuth } from '../lib/portal-auth';
import { API_BASE } from '../lib/api';

const INPUT_CLS =
  'monitor-input';
const LABEL_CLS = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400';

const EMPTY_SERVICE = { name: '', type: 'tcp', host: '', port: 80, url: '', description: '', expected_status: 200, expected_body: '', count: 1, threshold: '', interval: 1 };

export default function AgentPage() {
  const [backendUrl, setBackendUrl] = useState(
    `${window.location.protocol}//${window.location.hostname}:8000`,
  );
  const [hostId, setHostId] = useState('');
  const [interval, setIntervalSec] = useState(30);
  const [timeout, setTimeoutSec] = useState(5);
  const [inventory, setInventory] = useState(true);
  const [discovery, setDiscovery] = useState(true);
  const [certRoots, setCertRoots] = useState('C:\\Certificates');
  const [winServices, setWinServices] = useState('Spooler\nW32Time');
  const [services, setServices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  // Дополнительные параметры
  const [logLevel, setLogLevel] = useState('INFO');
  const [logFile, setLogFile] = useState('agent.log');
  const [backendTimeout, setBackendTimeout] = useState(10);
  const [retryAttempts, setRetryAttempts] = useState(3);
  const [retryDelay, setRetryDelay] = useState(5);
  const [bufferMax, setBufferMax] = useState(500);
  const [discoveryPort, setDiscoveryPort] = useState(19443);
  const [logMaxMb, setLogMaxMb] = useState(10);

  // Ручное добавление агента
  const [manualHostId, setManualHostId] = useState('');
  const [manualHostname, setManualHostname] = useState('');
  const [manualAddresses, setManualAddresses] = useState('');
  const [manualBusy, setManualBusy] = useState(false);
  const [manualMsg, setManualMsg] = useState(null);

  const lines = (s) => s.split('\n').map((v) => v.trim()).filter(Boolean);

  const updService = (i, field, value) =>
    setServices((list) => list.map((s, j) => (j === i ? { ...s, [field]: value } : s)));

  const build = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const payload = {
        backend_url: backendUrl.trim(),
        host_id: hostId.trim() || `pc-${new Date().toISOString().slice(0, 10)}`,
        check_interval: Number(interval) || 30,
        check_timeout: Number(timeout) || 5,
        inventory_enabled: inventory,
        discovery_enabled: discovery,
        cert_roots: lines(certRoots),
        windows_services: lines(winServices),
        log_level: logLevel,
        log_file: logFile.trim() || 'console',
        log_max_mb: Number(logMaxMb) || 10,
        backend_timeout: Number(backendTimeout) || 10,
        retry_attempts: Number(retryAttempts) || 3,
        retry_delay: Number(retryDelay) || 5,
        buffer_max: Number(bufferMax) || 500,
        discovery_port: Number(discoveryPort) || 19443,
        services: services
          .filter((s) => s.name.trim())
          .map((s) => ({
            name: s.name.trim(),
            type: s.type,
            host: s.host.trim(),
            port: Number(s.port) || undefined,
            url: s.url.trim(),
            description: s.description.trim() || undefined,
            expected_status: s.type === 'http' || s.type === 'https' ? (Number(s.expected_status) || undefined) : undefined,
            expected_body: s.type === 'http' || s.type === 'https' ? (s.expected_body.trim() || undefined) : undefined,
            count: s.type === 'icmp' ? (Number(s.count) || undefined) : undefined,
            threshold: s.threshold !== '' && s.threshold != null ? Number(s.threshold) || undefined : undefined,
            interval: ['cpu', 'network'].includes(s.type) ? (Number(s.interval) || undefined) : undefined,
          })),
      };
      const res = await authFetch(`${API_BASE}/api/agent/build`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.detail === 'string' ? body.detail : `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const dispo = res.headers.get('Content-Disposition') || '';
      const match = dispo.match(/filename="?([^";]+)"?/);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = match ? match[1] : 'monitor-agent.zip';
      a.click();
      URL.revokeObjectURL(a.href);
      const mode = res.headers.get('X-Agent-Build-Mode');
      setMessage(
        mode === 'exe'
          ? `Сборка готова: ${a.download}. Внутри готовый MonitorClient.exe — Python на целевом ПК не нужен. Распакуйте и запустите START-CLIENT.cmd (или установите службу: MonitorClient.exe install, затем start от администратора).`
          : `Сборка готова: ${a.download}. Внимание: exe-клиент ещё не собран — в пакете исходники, на целевом ПК потребуется Python. Соберите exe командой agent\\BUILD-EXE.cmd и пересоберите пакет.`,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const auth = getAuth();
  if (!auth || auth.user?.role !== 'admin') {
    return <div className="card p-8 text-center text-slate-400">Доступно только администраторам ИТ.</div>;
  }

  const addManualAgent = async () => {
    setManualBusy(true);
    setManualMsg(null);
    try {
      const addresses = (manualAddresses || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!manualHostId.trim() || !manualHostname.trim()) throw new Error('Укажите host_id и hostname');
      const res = await authFetch(`${API_BASE}/api/agent/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host_id: manualHostId.trim(), hostname: manualHostname.trim(), addresses }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`);
      setManualMsg({ ok: true, text: `Агент «${manualHostname}» добавлен в «Клиенты».` });
      setManualHostId('');
      setManualHostname('');
      setManualAddresses('');
    } catch (e) {
      setManualMsg({ ok: false, text: `Ошибка: ${e.message}` });
    } finally {
      setManualBusy(false);
    }
  };

  return (
    <div className="animate-fade-in mx-auto max-w-4xl space-y-6">
      {/* Заголовок */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-xl font-bold text-white">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-500 text-lg shadow-glow">🛰</span>
              Агенты
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">
              Ручное добавление хоста в «Клиенты» и сборка пакета агента мониторинга.
            </p>
          </div>
        </div>
      </div>

      {/* Ручное добавление агента */}
      <section className="card space-y-4 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-cyan-300">Добавить агента вручную</h2>
        <p className="text-sm text-slate-400">Создаёт карточку хоста в «Клиенты». Агент потом начнёт отправлять данные автоматически.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className={LABEL_CLS}>Host ID *</span>
            <input className={INPUT_CLS} placeholder="например office-pc-01" value={manualHostId} onChange={(e) => setManualHostId(e.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL_CLS}>Hostname *</span>
            <input className={INPUT_CLS} placeholder="имя компьютера" value={manualHostname} onChange={(e) => setManualHostname(e.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL_CLS}>IP-адреса (через запятую)</span>
            <input className={INPUT_CLS} placeholder="192.168.1.10, 10.0.0.5" value={manualAddresses} onChange={(e) => setManualAddresses(e.target.value)} />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={addManualAgent} disabled={manualBusy} className="monitor-button">
            {manualBusy ? 'Добавляю…' : '＋ Добавить агента'}
          </button>
          {manualMsg && <span className={`text-sm ${manualMsg.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{manualMsg.text}</span>}
        </div>
      </section>

      {/* Сборка клиента */}
      <section className="card space-y-4 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-cyan-300">Собрать пакет клиента</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={LABEL_CLS}>Адрес сервера (backend URL)</span>
            <input className={INPUT_CLS} value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} placeholder="http://192.168.1.100:8000" />
          </label>
          <label className="block">
            <span className={LABEL_CLS}>Идентификатор хоста (host_id)</span>
            <input className={INPUT_CLS} value={hostId} onChange={(e) => setHostId(e.target.value)} placeholder="office-pc-01 (пусто = автоматический)" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className={LABEL_CLS}>Интервал проверок, сек</span>
              <input type="number" min="5" className={INPUT_CLS} value={interval} onChange={(e) => setIntervalSec(e.target.value)} />
            </label>
            <label className="block">
              <span className={LABEL_CLS}>Таймаут проверки, сек</span>
              <input type="number" min="1" className={INPUT_CLS} value={timeout} onChange={(e) => setTimeoutSec(e.target.value)} />
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex max-w-md items-start gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={inventory} onChange={(e) => setInventory(e.target.checked)} className="mt-1 h-4 w-4 accent-cyan-400" />
            <span>
              <b className="text-slate-200">Собирать данные этого ПК</b><br />
              <span className="text-slate-500">Список установленных сертификатов, свободное место на дисках, состояние служб Windows. Ниже откроются поля «Каталоги сертификатов» и «Службы Windows».</span>
            </span>
          </label>
          <label className="flex max-w-md items-start gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={discovery} onChange={(e) => setDiscovery(e.target.checked)} className="mt-1 h-4 w-4 accent-cyan-400" />
            <span>
              <b className="text-slate-200">Отвечать на поиск клиентов сервером</b><br />
              <span className="text-slate-500">Клиент держит открытым TCP-порт и по запросу с паролем сообщает серверу своё имя — так он автоматически появляется на странице «Инвентаризация» без ручного добавления.</span>
            </span>
          </label>
        </div>
        {inventory && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={LABEL_CLS}>Каталоги сертификатов (по одному в строке)</span>
              <textarea className={INPUT_CLS} rows={2} value={certRoots} onChange={(e) => setCertRoots(e.target.value)} />
            </label>
            <label className="block">
              <span className={LABEL_CLS}>Службы Windows для контроля</span>
              <textarea className={INPUT_CLS} rows={2} value={winServices} onChange={(e) => setWinServices(e.target.value)} />
            </label>
          </div>
        )}
        {discovery && (
          <label className="block sm:w-64">
            <span className={LABEL_CLS}>Порт для поиска клиентов</span>
            <input type="number" min="1024" max="65535" className={INPUT_CLS} value={discoveryPort} onChange={(e) => setDiscoveryPort(e.target.value)} />
          </label>
        )}
      </section>

      {/* Отправка на сервер */}
      <section className="card space-y-4 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-cyan-300">Связь с сервером</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className={LABEL_CLS}>Таймаут запросов, сек</span>
            <input type="number" min="1" max="300" className={INPUT_CLS} value={backendTimeout} onChange={(e) => setBackendTimeout(e.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL_CLS}>Попыток отправки</span>
            <input type="number" min="1" max="20" className={INPUT_CLS} value={retryAttempts} onChange={(e) => setRetryAttempts(e.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL_CLS}>Пауза между попытками, сек</span>
            <input type="number" min="1" max="300" className={INPUT_CLS} value={retryDelay} onChange={(e) => setRetryDelay(e.target.value)} />
          </label>
        </div>
        <label className="block sm:w-64">
          <span className={LABEL_CLS}>Буфер неотправленных отчётов</span>
          <input type="number" min="10" max="10000" className={INPUT_CLS} value={bufferMax} onChange={(e) => setBufferMax(e.target.value)} />
          <span className="mt-1 block text-xs text-slate-500">Сколько результатов хранить, если сервер временно недоступен.</span>
        </label>
      </section>

      {/* Журналирование */}
      <section className="card space-y-4 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-cyan-300">Журнал (лог-файл)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL_CLS}>Подробность</span>
            <select className={INPUT_CLS} value={logLevel} onChange={(e) => setLogLevel(e.target.value)}>
              {['DEBUG', 'INFO', 'WARNING', 'ERROR'].map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <span className="mt-1 block text-xs text-slate-500">INFO — обычный режим; DEBUG — максимум деталей при разборе проблем.</span>
          </label>
          <label className="block">
            <span className={LABEL_CLS}>Файл журнала</span>
            <input className={INPUT_CLS} value={logFile} onChange={(e) => setLogFile(e.target.value)} placeholder="agent.log или console" />
            <span className="mt-1 block text-xs text-slate-500">Имя файла рядом с программой; «console» — выводить в окно.</span>
          </label>
          <label className="block">
            <span className={LABEL_CLS}>Авто-обрезка лога по размеру</span>
            <select className={INPUT_CLS} value={logMaxMb} onChange={(e) => setLogMaxMb(e.target.value)}>
              <option value={10}>10 МБ</option>
              <option value={100}>100 МБ</option>
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              При достижении размера лог автоматически сменяется новым (старый удаляется).
            </span>
          </label>
        </div>
      </section>

      {/* Проверяемые сервисы */}
      <section className="card p-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-cyan-300">Проверяемые сервисы</h2>
          <button type="button" onClick={() => setServices((l) => [...l, { ...EMPTY_SERVICE }])} className="monitor-button !px-3 !py-1.5 text-xs">
            + Добавить
          </button>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-slate-500">
          Это список проверок, которые агент выполняет за сервер: <b className="text-slate-400">tcp</b> — живой ли порт
          (например, БД 5432), <b className="text-slate-400">http/https</b> — отвечает ли URL (ожидается код/текст ответа),
          <b className="text-slate-400"> icmp</b> — пинг хоста. Каждая запись появляется на сервере отдельной карточкой
          со статусом UP/DOWN и историей. Плюс локальные метрики (CPU, диск, память) и службы Windows из поля
          «Службы Windows для контроля» выше.
        </p>
        {services.length === 0 && (
          <p className="text-sm text-slate-500">
            Список пуст — агент будет проверять только локальные метрики (CPU, память, диск при включённой инвентаризации). Токен и адрес сервера уже встроены в сборку.
          </p>
        )}
        <div className="space-y-3">
          {services.map((s, i) => {
            const isHttp = s.type === 'http' || s.type === 'https';
            const isIcmp = s.type === 'icmp';
            const isMetric = ['disk', 'cpu', 'memory', 'network'].includes(s.type);
            return (
              <div key={i} className="grid gap-2 rounded-xl border border-cyber-border bg-slate-900/40 p-3 sm:grid-cols-12">
                <input className={`${INPUT_CLS} sm:col-span-3`} placeholder="Имя" value={s.name} onChange={(e) => updService(i, 'name', e.target.value)} />
                <select className={`${INPUT_CLS} sm:col-span-2`} value={s.type} onChange={(e) => updService(i, 'type', e.target.value)}>
                  {['tcp', 'http', 'https', 'icmp'].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {isHttp ? (
                  <input className={`${INPUT_CLS} sm:col-span-5`} placeholder="URL проверки" value={s.url} onChange={(e) => updService(i, 'url', e.target.value)} />
                ) : (
                  <>
                    <input className={`${INPUT_CLS} sm:col-span-3`} placeholder="host" value={s.host} onChange={(e) => updService(i, 'host', e.target.value)} disabled={isMetric} />
                    <input className={`${INPUT_CLS} sm:col-span-2`} type="number" placeholder="port" value={s.port} onChange={(e) => updService(i, 'port', e.target.value)} disabled={isIcmp || isMetric} />
                  </>
                )}
                <input className={`${INPUT_CLS} sm:col-span-2`} placeholder="Описание" value={s.description} onChange={(e) => updService(i, 'description', e.target.value)} />
                <button type="button" onClick={() => setServices((l) => l.filter((_, j) => j !== i))} className="btn-ghost !px-2 sm:col-span-1" title="Удалить">✕</button>
                {isHttp && (
                  <>
                    <input className={`${INPUT_CLS} sm:col-span-2`} type="number" placeholder="Ожидаемый код (200)" value={s.expected_status} onChange={(e) => updService(i, 'expected_status', e.target.value)} title="Ожидаемый HTTP-код ответа" />
                    <input className={`${INPUT_CLS} sm:col-span-5`} placeholder="Ожидаемый текст в ответе (необязательно)" value={s.expected_body} onChange={(e) => updService(i, 'expected_body', e.target.value)} title="Подстрока, которая должна быть в теле ответа" />
                  </>
                )}
                {isIcmp && (
                  <input className={`${INPUT_CLS} sm:col-span-2`} type="number" min="1" max="10" placeholder="Пингов (1)" value={s.count} onChange={(e) => updService(i, 'count', e.target.value)} title="Сколько ping-пакетов отправлять" />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Результат/ошибки + кнопка сборки */}
      <section className="card p-6">
        {message && (
          <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 glow-up">
            ✅ {message}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 glow-down">
            ⚠ {error}
          </div>
        )}
        <button onClick={build} disabled={busy} className="monitor-button w-full text-base">
          {busy ? 'Собираю пакет…' : '📦 Собрать build и скачать'}
        </button>
        <p className="mt-3 text-xs text-slate-500">
          На целевом хосте: распаковать архив. Установка как Windows-службы одним файлом — <code className="text-cyan-300">INSTALL-SERVICE.bat</code>
          (сам запросит права администратора, установит и запустит службу). Ручной запуск: <code className="text-cyan-300">MonitorClient.exe</code> или <code className="text-cyan-300">START-CLIENT.cmd</code>;
          вручную как служба: <code className="text-cyan-300">MonitorClient.exe install</code>, затем <code className="text-cyan-300">MonitorClient.exe start</code>.
          Если в проекте ещё не собран exe (agent\BUILD-EXE.cmd), в пакет попадут исходники — тогда на целевом ПК потребуется Python 3.13.
        </p>

      </section>
    </div>
  );
}
