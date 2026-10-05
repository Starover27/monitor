/**
 * Login — вход на портал.
 * 1) Сначала экран загрузки (лого logo2.png).
 * 2) Затем окно авторизации с логотипом Logo.png в полный размер картинки.
 * Кнопки без пароля: «Войти через Windows» (SSO/Negotiate) и сертификат (по https).
 * Автовход запускается ТОЛЬКО по нажатию кнопки.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginRequest, setAuth } from '../lib/portal-auth';
import { API_BASE } from '../lib/api';

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20';

/** Экран загрузки: лого logo2.png по центру, белый фон. */
function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <img
        src="/logo2.png"
        alt="Загрузка…"
        className="h-56 w-auto animate-pulse-soft rounded-2xl bg-white p-3 shadow-[0_16px_48px_rgba(0,0,0,0.12)]"
      />
      <p className="mt-8 text-sm font-medium tracking-wide text-slate-500">
        Загрузка портала…
      </p>
      <div className="mt-3 h-1 w-40 overflow-hidden rounded-full bg-slate-200">
        <div className="login-bar h-full w-1/3 rounded-full bg-[#e63a2e]" />
      </div>
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [stage, setStage] = useState('loading'); // loading -> form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ssoBusy, setSsoBusy] = useState(false);

  // Короткий экран загрузки перед окном авторизации
  useEffect(() => {
    const t = setTimeout(() => setStage('form'), 1400);
    return () => clearTimeout(t);
  }, []);

  if (stage === 'loading') return <LoadingScreen />;

  // Вход через Windows-домен (Negotiate) — только по кнопке
  const trySso = async () => {
    setSsoBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/sso`);
      if (res.ok) {
        const data = await res.json();
        setAuth(data);
        navigate('/portal');
        return;
      }
      if (res.status === 501) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || 'Автовход Windows выключен. Включите его в Админ-панели: Настройки → «Автовход Windows (SSO)».');
      } else {
        setError(
          'Браузер не передал доменный токен. Проверьте, что сайт добавлен в зону «Местная интрасеть» ' +
          '(Параметры браузера/Internet Options → Безопасность → Местная интрасеть →Sites → Добавить) ' +
          'и что в домене разрешён автовход. Иначе введите логин и пароль.'
        );
      }
    } catch {
      setError('Автовход Windows недоступен. Введите логин и пароль.');
    }
    setSsoBusy(false);
  };

  // Вход по клиентскому сертификату (https + mTLS-прокси 8443) — только по кнопке
  const tryCertLogin = async () => {
    setSsoBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/cert/me`);
      if (res.ok) {
        const data = await res.json();
        setAuth(data);
        navigate('/portal');
        return;
      }
      if (res.status === 401) {
        setError('Сертификат не выбран. Установите личный сертификат (.p12) и повторите.');
      } else {
        setError('Сертификатный вход недоступен по этому адресу. Откройте портал по https://<сервер>:8443');
      }
    } catch {
      setError('Сертификатный вход недоступен. Введите логин и пароль.');
    }
    setSsoBusy(false);
  };

  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await loginRequest(username.trim(), password);
      setAuth(data);
      navigate('/portal');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f5f7] px-4 py-8">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_12px_48px_rgba(15,23,42,0.12)] animate-fade-in">
        {/* Логотип в полный размер картинки */}
        <div className="flex justify-center bg-white px-8 pt-9">
          <img
            src="/logo.png"
            alt="Логотип организации"
            className="h-auto w-[194px] rounded-lg shadow-sm"
          />
        </div>

        <div className="px-8 pb-8 pt-6 sm:px-10">
          <h2 className="text-xl font-bold text-[#1f2937]">Вход в портал</h2>
          <p className="mt-1 text-sm text-slate-500">Введите доменный логин и пароль</p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Доменный логин</span>
              <input
                className={inputCls}
                placeholder="KST\ivanov или просто ivanov"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Пароль</span>
              <input
                type="password"
                className={inputCls}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !username.trim() || !password}
              className="w-full rounded-lg bg-[#e63a2e] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#c9301f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Вход…' : 'Войти'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wide text-slate-300">
            <span className="h-px flex-1 bg-slate-200" /> без пароля <span className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="space-y-2">
            <button
              type="button"
              disabled={ssoBusy || busy}
              onClick={trySso}
              className="w-full rounded-lg border border-[#2b3a4b] bg-white py-3 text-sm font-semibold text-[#2b3a4b] transition-colors hover:bg-[#2b3a4b]/5 disabled:opacity-50"
            >
              {ssoBusy ? 'Проверяю домен…' : '🪟 Войти через Windows'}
            </button>
            {isHttps && (
              <button
                type="button"
                disabled={ssoBusy || busy}
                onClick={tryCertLogin}
                className="w-full rounded-lg border border-emerald-600 bg-white py-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
              >
                🔐 Войти по сертификату
              </button>
            )}
          </div>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-400">
            Уже вошли в Windows под доменной учётной записью? Жмите «Войти через Windows» —
            пароль не понадобится (портал должен быть в зоне «Местная интрасеть»).
          </p>
        </div>
      </div>
    </div>
  );
}
