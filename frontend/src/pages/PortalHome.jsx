/**
 * PortalHome — три режима:
 * scope="home"    — новости + полезная информация (без форм)
 * scope="docs"    — документы и кадровые вопросы (справки, заявления…) + мои заявления
 * scope="absence" — отпуск, больничный, отгул, командировка + мои заявления
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFetch } from '../hooks/useFetch';
import { authSend, getAuth } from '../lib/portal-auth';
import {
  PORTAL_KIND_LABELS, PORTAL_KIND_ICONS,
  PORTAL_STATUS_LABELS, PORTAL_STATUS_STYLES,
} from '../lib/desk';
import { API_BASE, formatDateTime } from '../lib/api';
import { launchMedreg, MEDREG_PATH } from '../lib/medreg';

// Настройки внешнего вида (загружаются один раз, применяются к hero-блоку)
let _uiSettings = null;
export function useUISettings() {
  const [ui, setUi] = useState(_uiSettings || { LOGO_PATH: '', HERO_BG_IMAGE: '', HERO_BG_OPACITY: '0.35', HERO_BG_BLUR: '0', HERO_TITLE_COLOR: '', PANEL_BG: '' });
  useEffect(() => {
    if (_uiSettings) return;
    fetch(`${API_BASE}/api/ui/settings`).then((r) => (r.ok ? r.json() : null)).then((s) => { if (s) { _uiSettings = s; setUi(s); } }).catch(() => {});
  }, []);
  return ui;
}

const GROUPS = [
  {
    key: 'absence',
    title: 'Отсутствие на работе',
    icon: '🌴',
    desc: 'Отпуск, больничный, отгул, командировка — заявления с датами',
    items: ['vacation', 'sick_leave', 'dayoff', 'business_trip'],
  },
  {
    key: 'docs',
    title: 'Документы и кадровые вопросы',
    icon: '📄',
    desc: 'Справки, материальная помощь, кадровые вопросы',
    items: ['certificate', 'material_aid', 'personnel'],
  },
];

const NEEDS_DATES = new Set(['vacation', 'sick_leave', 'dayoff', 'business_trip']);

const PLACEHOLDERS = {
  vacation: 'Прошу предоставить очередной оплачиваемый отпуск с … по …',
  sick_leave: 'Номер листка нетрудоспособности, период (при открытии дома)…',
  dayoff: 'Дата и причина отгула…',
  business_trip: 'Куда, на какой срок и цель командировки…',
  certificate: 'Например: справка с места работы для соцзащиты, 2 экз.',
  material_aid: 'Причина и описание ситуации…',
  personnel: 'Описание кадрового вопроса…',
  statement: 'Текст заявления…',
};

const EMPTY = { kind: 'vacation', details: '', date_from: '', date_to: '' };

export default function PortalHome({ scope = 'home' }) {
  const auth = getAuth();
  const navigate = useNavigate();
  // Профиль из localStorage — быстрый первый рендер без запроса;
  // /auth/me подгружается только если ФИО ещё не сохранены (например, после смены в AD)
  const [me, setMe] = useState(null);
  const ui = useUISettings();

  useEffect(() => {
    const known = auth?.user?.full_name;
    if (known && auth?.user?.email != null) return;
    authSend(`${API_BASE}/api/auth/me`, 'GET')
      .then(setMe)
      .catch(() => { /* остаёмся на данных localStorage */ });
  }, []);

  const fullName = me?.full_name || auth?.user?.full_name || auth?.user?.username || '';
  const email = me?.email || auth?.user?.email || '';
  const name = fullName;
  // «Здравствуйте, Имя Отчество» — без фамилии. Для «Иванов Иван Иванович» → «Иван Иванович»
  const greetingName = (() => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 3) return `${parts[1]} ${parts[2]}`;
    if (parts.length === 2) {
      const second = parts[1];
      // «Администратор системы» / «Кадровая служба» — не имена: оставляем целиком
      return /^[А-ЯЁA-Z]/.test(second) ? second : fullName;
    }
    return fullName;
  })();

  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [created, setCreated] = useState(null);

  const authHeaders = useMemo(() => {
    const t = getAuth()?.token;
    return t ? { Authorization: `Bearer ${t}` } : undefined;
  }, []);

  const { data, error, refetch } = useFetch(
    `${API_BASE}/api/portal?employee=${encodeURIComponent(name)}`,
    { interval: 30000, headers: authHeaders },
  );
  const newsQ = useFetch(`${API_BASE}/api/news`, { interval: 60000, headers: authHeaders });
  const newsItems = useMemo(() => (Array.isArray(newsQ.data) ? newsQ.data : []), [newsQ.data]);

  const myRequests = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const activeCount = useMemo(
    () => myRequests.filter((r) => r.status === 'new' || r.status === 'in_progress').length,
    [myRequests],
  );
  const approvedCount = useMemo(() => myRequests.filter((r) => r.status === 'done').length, [myRequests]);

  const needsDates = NEEDS_DATES.has(form.kind);

  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const formRef = useRef(null);

  const submit = async (e) => {
    e.preventDefault();
    if (needsDates && (!form.date_from || !form.date_to)) {
      setFormError('Укажите даты начала и окончания');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const req = await authSend(`${API_BASE}/api/portal`, 'POST', {
        kind: form.kind,
        employee_name: name,
        details: form.details.trim() || null,
        date_from: needsDates ? form.date_from : null,
        date_to: needsDates ? form.date_to : null,
      });
      setCreated(req);
      setForm({ ...EMPTY });
      refetch();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const selectKind = (kind) => {
    setForm((f) => ({ ...f, kind }));
    // прокрутка к форме при выборе услуги
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Приветственный баннер */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="relative overflow-hidden p-6 sm:p-8" style={
          ui.HERO_BG_IMAGE
            ? { backgroundImage: `url(${ui.HERO_BG_IMAGE})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: 'linear-gradient(to right, #2b3a4b, #1e293b)' }
        }>
          {/* Затемнение/осветление поверх фона */}
          <div
            className="absolute inset-0"
            style={{
              background: ui.HERO_BG_IMAGE ? `rgba(43, 58, 75, ${parseFloat(ui.HERO_BG_OPACITY) || 0.35})` : 'transparent',
              backdropFilter: ui.HERO_BG_IMAGE && Number(ui.HERO_BG_BLUR) > 0 ? `blur(${ui.HERO_BG_BLUR}px)` : undefined,
            }}
          />
          <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[#e63a2e]/20 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-10 right-32 h-24 w-24 rounded-full bg-sky-400/10 blur-xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
                {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <h1 className="mt-1.5 text-2xl font-bold text-white" style={ui.HERO_TITLE_COLOR ? { color: ui.HERO_TITLE_COLOR } : undefined}>
                {scope === 'absence' ? 'Отсутствие на работе'
                  : scope === 'docs' ? 'Документы и кадровые вопросы'
                    : `Здравствуйте, ${greetingName}!`}
              </h1>
              <p className="mt-1 max-w-lg text-sm text-white/70">
                {scope === 'absence' ? 'Заявления с указанием дат — уведомление о статусе придёт на почту'
                  : scope === 'docs' ? 'Справки, материальная помощь и кадровые вопросы'
                    : activeCount > 0 ? `Заявлений на рассмотрении: ${activeCount}` : 'Заявлений на рассмотрении нет'}
              </p>
            </div>
            {scope === 'home' && (
              <div className="hidden sm:flex items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/80 backdrop-blur">
                  <span className="h-2 w-2 animate-pulse-soft rounded-full bg-emerald-400" />
                  Портал доступен
                </span>
              </div>
            )}
          </div>
        </div>
        {scope !== 'home' && (
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100">
            {[
              ['На рассмотрении', activeCount, 'text-amber-600'],
              ['Одобрено', approvedCount, 'text-emerald-600'],
              ['Всего заявлений', myRequests.length, 'text-sky-600'],
            ].map(([label, count, cls]) => (
              <div key={label} className="px-4 py-3 text-center">
                <p className={`text-xl font-bold ${cls}`}>{count}</p>
                <p className="text-[11px] text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* МИС МедРег — запуск (только на главной) */}
      {scope === 'home' && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-2xl">🩺</span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">МИС</p>
              <button onClick={() => navigate('/medreg')} className="text-lg font-bold text-[#1f2937] underline-offset-4 hover:underline">
                Открыть МедРег
              </button>
              <p className="text-xs text-slate-400">медицинская информационная система · {MEDREG_PATH}</p>
            </div>
          </div>
          <button
            onClick={launchMedreg}
            className="portal-btn rounded-xl bg-[#e63a2e] px-5 py-2.5 text-sm font-bold text-white shadow-[0_6px_16px_-6px_rgba(230,58,46,0.6)] hover:bg-[#c9301f]"
          >
            ▶ Запустить МедРег
          </button>
        </section>
      )}

      {/* Новости клиники (только на главной) */}
      {scope === 'home' && newsItems.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="h-1 bg-[#e63a2e]" />
          <div className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#1f2937]">Новости клиники</h2>
              <span className="text-xs text-slate-400">объявления администрации</span>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {newsItems.slice(0, 3).map((n, i) => (
                <article
                  key={n.id}
                  className={`rounded-lg border p-4 ${i === 0 && (n.pinned === 1 || n.pinned === true)
                    ? 'border-[#e63a2e]/30 bg-[#e63a2e]/[0.04]'
                    : 'border-slate-100 bg-slate-50/60'}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {(n.pinned === 1 || n.pinned === true) && (
                      <span className="rounded-full bg-[#e63a2e] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">важно</span>
                    )}
                    <h3 className="font-bold text-[#1f2937]">{n.title}</h3>
                  </div>
                  {n.body_html ? (
                    <div
                      className="news-rich mt-2 text-sm leading-relaxed text-slate-600"
                      dangerouslySetInnerHTML={{ __html: n.body_html }}
                    />
                  ) : (
                    <>
                      {n.image && <img src={n.image} alt="" className="mt-2 max-h-44 w-full rounded-lg object-cover" />}
                      {n.body && <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{n.body}</p>}
                    </>
                  )}
                  <p className="mt-2 text-[11px] text-slate-400">{n.author || 'Администрация'} · {formatDateTime(n.created_at, false)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Полезная информация (только на главной) */}
      {scope === 'home' && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 px-6 pt-5">
            <span className="h-4 w-1 rounded-full bg-[#e63a2e]" />
            <h2 className="text-base font-bold text-[#1f2937]">Полезная информация</h2>
          </div>
          <div className="grid gap-3 p-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['🕐', 'Часы работы', 'Пн–Пт 8:00–20:00, Сб, Вс 8:00–19:00'],
              ['☎️', 'Регистратура', 'вн. 104 · запись на приём'],
              ['🛠', 'IT-поддержка', 'вн. 0100 · admin@kst27.ru'],
              ['🚑', 'Скорая помощь', '103 / 112 · круглосуточно'],
            ].map(([icon, title, text]) => (
              <div key={title} className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3.5">
                <span className="text-lg">{icon}</span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
                  <p className="mt-0.5 text-sm font-medium text-[#1f2937]">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Услуги (только на страницах Отсутствие и Документы) */}
      {scope !== 'home' && (
        <>
          <h2 className="text-lg font-bold text-[#1f2937]">
            {scope === 'absence' ? 'Отсутствие на работе' : 'Документы и кадровые вопросы'}
          </h2>
          <form onSubmit={submit} className="space-y-4">
        {GROUPS.filter((g) => g.key === (scope === 'absence' ? 'absence' : 'docs')).map((group) => (
          <section key={group.key} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg">{group.icon}</span>
              <div>
                <h3 className="font-bold text-[#1f2937]">{group.title}</h3>
                <p className="text-xs text-slate-500">{group.desc}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {group.items.map((key) => {
                const selected = form.kind === key;
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => selectKind(key)}
                    aria-pressed={selected}
                    className={`flex items-center gap-3 rounded-lg border p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-10px_rgba(43,58,75,0.35)] ${
                      selected
                        ? 'border-[#e63a2e] bg-[#e63a2e]/5 ring-2 ring-[#e63a2e]/20'
                        : 'border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-xl">{PORTAL_KIND_ICONS[key]}</span>
                    <span className={`text-sm font-semibold ${selected ? 'text-[#e63a2e]' : 'text-[#1f2937]'}`}>
                      {PORTAL_KIND_LABELS[key]}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {/* Форма заявления */}
        <div ref={formRef} className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="h-4 w-1 rounded-full bg-[#e63a2e]" />
            <h3 className="font-bold text-[#1f2937]">Заявление</h3>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e63a2e]/30 bg-[#e63a2e]/5 px-3 py-1 text-xs font-semibold text-[#e63a2e]">
              {PORTAL_KIND_ICONS[form.kind]} {PORTAL_KIND_LABELS[form.kind]}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {needsDates && (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Дата начала *</span>
                  <input type="date" className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20" value={form.date_from} onChange={setField('date_from')} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Дата окончания *</span>
                  <input type="date" className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20" value={form.date_to} onChange={setField('date_to')} />
                </label>
              </>
            )}
            <label className={`block ${needsDates ? '' : 'sm:col-span-2'}`}>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {form.kind === 'certificate' ? 'Какая справка нужна' : 'Текст / пояснение'}
              </span>
              <textarea
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20"
                rows={3}
                placeholder={PLACEHOLDERS[form.kind] || 'Текст заявления…'}
                value={form.details}
                onChange={setField('details')}
              />
            </label>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Уведомление будет отправлено на вашу почту{email ? ` (${email})` : ''} при изменении статуса.
          </p>
          {formError && (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600">{formError}</p>
          )}
          <button
            className="btn-primary mt-4"
            type="submit"
            disabled={busy}
          >
            {busy ? 'Отправка…' : 'Подать заявление'}
          </button>
        </div>
      </form>
      </>
      )}

      {created && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          ✅ {PORTAL_KIND_LABELS[created.kind]} №{created.id} принято. Уведомление отправлено в кадровую службу.
        </div>
      )}

      {/* Мои заявления (не на главной) */}
      {scope !== 'home' && (
      <>
      <div>
        <h1 className="text-xl font-bold text-[#1f2937]">
          {scope === 'absence' ? 'Заявления · Отсутствие' : 'Мои заявления'}
        </h1>
      </div>
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          Не удалось загрузить заявления: {error}
        </div>
      )}
      {myRequests.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="font-semibold text-slate-600">Заявлений пока нет</p>
          <p className="mt-1 text-sm text-slate-400">Выберите услугу выше и подайте первое заявление.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {myRequests.map((r) => (
            <article key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-400">№{r.id}</span>
                  <h3 className="font-bold text-[#1f2937]">{PORTAL_KIND_LABELS[r.kind]}</h3>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PORTAL_STATUS_STYLES[r.status]}`}>
                    {PORTAL_STATUS_LABELS[r.status]}
                  </span>
                </div>
                {(r.date_from || r.details) && (
                  <p className="mt-1.5 text-sm text-slate-500">
                    {r.date_from && `Период: ${r.date_from} — ${r.date_to}. `}
                    {r.details}
                  </p>
                )}
                {r.admin_comment && (
                  <p className="mt-1 text-sm font-medium text-[#e63a2e]">Ответ: {r.admin_comment}</p>
                )}
              </div>
              <time className="text-xs text-slate-400" title={formatDateTime(r.created_at)}>
                {formatDateTime(r.created_at)}
              </time>
            </article>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}
