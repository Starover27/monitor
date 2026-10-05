/**
 * AdminPanel — панель управления порталом (только для админов).
 * Вкладки: Разделы (меню портала), Пользователи (роли, доступы, пароли).
 */
import { useEffect, useMemo, useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { authSend, getAuth, setAuth } from '../lib/portal-auth';
import { API_BASE } from '../lib/api';
import RichEditor from '../components/RichEditor';

const inputCls = 'w-full rounded-lg border border-slate-400 bg-white px-3.5 py-2.5 text-[15px] font-semibold text-[#111827] outline-none transition-colors placeholder:font-normal placeholder:text-slate-500 focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20';

export default function AdminPanel() {
  const [tab, setTab] = useState('sections');
  const authHeaders = useMemo(() => {
    const t = getAuth()?.token;
    return t ? { Authorization: `Bearer ${t}` } : undefined;
  }, []);
  const sectionsQ = useFetch(`${API_BASE}/api/admin/sections`, { interval: 0, headers: authHeaders });
  const usersQ = useFetch(`${API_BASE}/api/admin/users`, { interval: 0, headers: authHeaders });

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1f2937]">Админ-панель портала</h1>
        <p className="mt-1 text-sm text-slate-500">Управление разделами меню, правами пользователей и настройками</p>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {[
          ['sections', '🗂 Разделы'],
          ['users', '👥 Пользователи'],
          ['news', '📰 Новости'],
          ['ui', '🎨 Интерфейс'],
          ['settings', '⚙️ Настройки'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === key ? 'bg-[#e63a2e] text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-[#2b3a4b]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'sections' && <SectionsTab q={sectionsQ} />}
      {tab === 'users' && <UsersTab q={usersQ} />}
      {tab === 'news' && <NewsTab />}
      {tab === 'ui' && <UITab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'agents' && <AgentsTab />}
    </div>
  );
}

/* ==================== Разделы ==================== */

function SectionsTab({ q }) {
  const { data, error, refetch } = q;
  const [form, setForm] = useState({ label: '', icon: '', path: '' });
  const [busy, setBusy] = useState(false);
  const sections = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); refetch(); } catch (e) { alert(`Ошибка: ${e.message}`); } finally { setBusy(false); }
  };

  const add = () => run(async () => {
    if (!form.label.trim() || !form.path.trim()) throw new Error('Заполните название и путь');
    await authSend(`${API_BASE}/api/admin/sections`, 'POST', {
      label: form.label.trim(), icon: form.icon.trim(), path: form.path.trim(),
      sort_order: sections.length * 10, enabled: true, admin_only: false,
    });
    setForm({ label: '', icon: '', path: '' });
  });

  const patch = (sec, updates) => run(async () => {
    await authSend(`${API_BASE}/api/admin/sections/${sec.id}`, 'PATCH', updates);
  });

  const remove = (sec) => run(async () => {
    await authSend(`${API_BASE}/api/admin/sections/${sec.id}`, 'DELETE');
  });

  return (
    <div className="space-y-4">
      {/* Добавление */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-bold text-[#1f2937]">Новый раздел</h2>
        <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr_auto]">
          <input className={inputCls} style={{ maxWidth: 80 }} placeholder="🗺" value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} />
          <input className={inputCls} placeholder="Название раздела" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
          <input className={inputCls} placeholder="Путь, например /helpdesk" value={form.path} onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))} />
          <button className="rounded-lg bg-[#e63a2e] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#c9301f] disabled:opacity-50" onClick={add} disabled={busy}>
            Добавить
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Раздел появится в меню портала у всех сотрудников (или только у админов, если включить «Только админ»).
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">Не удалось загрузить разделы: {error}</div>
      )}

      {/* Список */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Иконка</th>
              <th className="px-3 py-3 font-semibold">Название</th>
              <th className="px-3 py-3 font-semibold">Путь</th>
              <th className="px-3 py-3 font-semibold">Виден</th>
              <th className="px-3 py-3 font-semibold">Только админ</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => (
              <tr key={sec.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2.5 text-lg">{sec.icon || '—'}</td>
                <td className="px-3 py-2.5">
                  <input
                    className="w-full rounded-lg border border-transparent px-2 py-1 font-medium text-[#1f2937] hover:border-slate-300 focus:border-[#e63a2e] focus:outline-none"
                    defaultValue={sec.label}
                    onBlur={(e) => e.target.value.trim() !== sec.label && patch(sec, { label: e.target.value.trim() })}
                  />
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{sec.path}</td>
                <td className="px-3 py-2.5">
                  <Toggle checked={sec.enabled} onChange={(v) => patch(sec, { enabled: v })} />
                </td>
                <td className="px-3 py-2.5">
                  <Toggle checked={sec.admin_only} onChange={(v) => patch(sec, { admin_only: v })} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-rose-300 hover:text-rose-600"
                    onClick={() => window.confirm(`Удалить раздел «${sec.label}»?`) && remove(sec)}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}
      role="switch"
      aria-checked={checked}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

/* ==================== Пользователи ==================== */

function UsersTab({ q }) {
  const { data, error, refetch } = q;
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', full_name: '', department: '', role: 'employee' });
  const [permsUser, setPermsUser] = useState(null);
  // синхронизация из AD
  const [adOpen, setAdOpen] = useState(false);
  const [adList, setAdList] = useState(null);
  const [adSel, setAdSel] = useState(new Set());
  const [adBusy, setAdBusy] = useState(false);
  const [adErr, setAdErr] = useState(null);
  const [adCreds, setAdCreds] = useState({ bind_user: '', bind_password: '' });
  const [adFilter, setAdFilter] = useState('');
  const [adGroupFilter, setAdGroupFilter] = useState('');
  // Поиск/фильтр по списку пользователей портала
  const [uFilter, setUFilter] = useState('');
  const [uTypeFilter, setUTypeFilter] = useState(''); // '' | domain | local
  const users = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const filteredUsers = useMemo(() => {
    const q = uFilter.trim().toLowerCase();
    return users.filter((u) => {
      if (uTypeFilter === 'domain' && !u.is_domain) return false;
      if (uTypeFilter === 'local' && u.is_domain) return false;
      if (!q) return true;
      return [u.username, u.full_name, u.department, u.position]
        .some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [users, uFilter, uTypeFilter]);

  const filteredAdUsers = useMemo(() => {
    if (!adList) return [];
    const q = adFilter.trim().toLowerCase();
    return (adList.users || []).filter((u) => {
      if (adGroupFilter && !(u.groups || []).includes(adGroupFilter)) return false;
      if (!q) return true;
      return [u.username, u.full_name, u.department, u.position]
        .some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [adList, adFilter, adGroupFilter]);

  // Группировка: по отделу (или "— без отдела —"), с учётом фильтра
  const groupedAdUsers = useMemo(() => {
    const groups = {};
    for (const u of filteredAdUsers) {
      const key = u.department || '— без отдела —';
      (groups[key] = groups[key] || []).push(u);
    }
    return groups;
  }, [filteredAdUsers]);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); refetch(); } catch (e) { alert(`Ошибка: ${e.message}`); } finally { setBusy(false); }
  };

  const add = () => run(async () => {
    await authSend(`${API_BASE}/api/admin/users`, 'POST', form);
    setForm({ username: '', password: '', full_name: '', department: '', role: 'employee' });
  });

  const patch = (u, updates) => run(async () => {
    await authSend(`${API_BASE}/api/admin/users/${u.id}`, 'PATCH', updates);
  });

  const resetPassword = (u) => {
    const p = window.prompt(`Новый пароль для «${u.username}»:`);
    if (p) patch(u, { password: p });
  };

  const issueCert = async (u) => {
    const pwd = window.prompt(`Пароль для файла-сертификата ${u.username}.p12\n(пользователь введёт его при установке):`, '');
    if (pwd === null) return;
    try {
      const auth = getAuth();
      const res = await fetch(`${API_BASE}/api/cert/issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth?.token}` },
        body: JSON.stringify({ username: u.username, password: pwd || 'portal' }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.detail === 'string' ? d.detail : 'Ошибка выпуска сертификата');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${u.username}.p12`;
      a.click();
      URL.revokeObjectURL(a.href);
      alert(`Сертификат ${u.username}.p12 скачан.\n\nПередайте файл пользователю. Установка: двойной клик → «Установить» → «Поместить в личное хранилище».\nЗатем вход: https://<адрес-сервера>:8443 → браузер сам подставит сертификат.`);
    } catch (e) {
      alert(`Ошибка: ${e.message}`);
    }
  };

  const loadAdUsers = async () => {
    setAdBusy(true);
    setAdErr(null);
    try {
      const r = await authSend(`${API_BASE}/api/settings/ad-users`, 'POST', adCreds);
      setAdList(r);
      setAdSel(new Set((r.users || []).map((u) => u.username)));
      setAdFilter('');
      setAdGroupFilter('');
      setAdOpen(true);
    } catch (e) {
      setAdErr(e.message);
    } finally {
      setAdBusy(false);
    }
  };

  const importAd = async () => {
    setAdBusy(true);
    try {
      const list = (adList.users || []).filter((u) => adSel.has(u.username));
      const r = await authSend(`${API_BASE}/api/admin/users/import-ad`, 'POST', { users: list, replace_roles: false });
      refetch();
      setAdOpen(false);
      alert(`Синхронизировано: создано ${r.created}, обновлено ${r.updated}`);
    } catch (e) {
      setAdErr(e.message);
    } finally {
      setAdBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Добавление */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-bold text-[#1f2937]">Новый пользователь (локальная учётка)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input className={inputCls} placeholder="Логин *" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
          <input className={inputCls} placeholder="Пароль *" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          <input className={inputCls} placeholder="ФИО" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
          <input className={inputCls} placeholder="Отдел" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
          <select className={inputCls} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            <option value="employee">Сотрудник</option>
            <option value="admin">Администратор ИТ</option>
          </select>
          <button className="rounded-lg bg-[#e63a2e] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#c9301f] disabled:opacity-50" onClick={add} disabled={busy}>
            Добавить
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Доменные пользователи создаются автоматически при первом входе через AD; их роль можно менять здесь.
          Роль администратора также назначается автоматически, если пользователь состоит в группе из LDAP_ADMIN_GROUPS.
        </p>
        <div className="mt-3">
          <button
            className="rounded-lg bg-[#2b3a4b] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#e63a2e] disabled:opacity-50"
            onClick={() => { setAdOpen(true); setAdErr(null); setAdList(null); }}
            disabled={adBusy}
          >
            🔄 Загрузить пользователей из домена
          </button>
          {adErr && <p className="mt-2 text-sm text-rose-600">{adErr}</p>}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">Не удалось загрузить пользователей: {error}</div>
      )}

      {/* Поиск и фильтр */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          className="w-72 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20"
          placeholder="Поиск: логин, ФИО, отдел, должность…"
          value={uFilter}
          onChange={(e) => setUFilter(e.target.value)}
        />
        <select
          className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-[#111827] outline-none focus:border-[#e63a2e]"
          value={uTypeFilter}
          onChange={(e) => setUTypeFilter(e.target.value)}
        >
          <option value="">Все типы ({users.length})</option>
          <option value="domain">Доменные ({users.filter((u) => u.is_domain).length})</option>
          <option value="local">Локальные ({users.filter((u) => !u.is_domain).length})</option>
        </select>
        <span className="text-xs text-slate-400">Найдено: {filteredUsers.length}</span>
        {(uFilter || uTypeFilter) && (
          <button className="text-xs text-sky-600 hover:underline" onClick={() => { setUFilter(''); setUTypeFilter(''); }}>Сбросить</button>
        )}
      </div>

      {/* Список */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Логин</th>
              <th className="px-3 py-3 font-semibold">ФИО</th>
              <th className="px-3 py-3 font-semibold">Отдел</th>
              <th className="px-3 py-3 font-semibold">Группы AD</th>
              <th className="px-3 py-3 font-semibold">Тип</th>
              <th className="px-3 py-3 font-semibold">Роль</th>
              <th className="px-3 py-3 font-semibold">Активен</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u.id} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${u.disabled ? 'opacity-50' : ''}`}>
                <td className="px-4 py-2.5 font-medium text-[#1f2937]">{u.username}</td>
                <td className="px-3 py-2.5">
                  <input
                    className="w-full rounded-lg border border-transparent px-2 py-1 hover:border-slate-300 focus:border-[#e63a2e] focus:outline-none"
                    defaultValue={u.full_name || ''}
                    onBlur={(e) => e.target.value !== (u.full_name || '') && patch(u, { full_name: e.target.value })}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <input
                    className="w-full rounded-lg border border-transparent px-2 py-1 hover:border-slate-300 focus:border-[#e63a2e] focus:outline-none"
                    defaultValue={u.department || ''}
                    onBlur={(e) => e.target.value !== (u.department || '') && patch(u, { department: e.target.value })}
                  />
                </td>
                <td className="px-3 py-2.5">
                  {(u.ad_groups || []).length > 0
                    ? u.ad_groups.slice(0, 3).map((g) => (
                        <span key={g} className="mr-1 inline-block rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700" title={u.ad_groups.join(', ')}>{g}</span>
                      ))
                    : <span className="text-xs text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2.5 text-xs">
                  {u.is_domain
                    ? <span className="rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 font-semibold text-sky-700">AD (домен)</span>
                    : <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-slate-500">локальная</span>}
                </td>
                <td className="px-3 py-2.5">
                  <select
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                    value={u.role}
                    onChange={(e) => patch(u, { role: e.target.value })}
                  >
                    <option value="employee">Сотрудник</option>
                    <option value="admin">Администратор ИТ</option>
                  </select>
                </td>
                <td className="px-3 py-2.5">
                  <Toggle checked={!u.disabled} onChange={(v) => patch(u, { disabled: !v })} />
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <button
                    className="mr-1.5 rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
                    onClick={() => issueCert(u)}
                  >
                    🔑 Сертификат
                  </button>
                  <button
                    className="mr-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400"
                    onClick={() => setPermsUser(u)}
                  >
                    Права
                  </button>
                  <button
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400"
                    onClick={() => resetPassword(u)}
                  >
                    Сменить пароль
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {permsUser && <PermissionsModal user={permsUser} onClose={() => setPermsUser(null)} />}

      {/* Синхронизация из AD */}
      {adOpen && !adList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#1f2937]">Вход в домен для поиска</h3>
            <p className="mt-1 text-xs text-slate-500">
              Введите доменный логин и пароль (достаточно любой действующей учётки) — по ним будет прочитан список пользователей домена.
            </p>
            <div className="mt-4 space-y-3">
              <input
                className="w-full rounded-lg border border-slate-400 bg-white px-3.5 py-2.5 text-[15px] font-semibold tracking-wide text-[#111827] outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-500 focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20"
                placeholder="Логин: admin@kst.local или KST\admin"
                value={adCreds.bind_user}
                onChange={(e) => setAdCreds((c) => ({ ...c, bind_user: e.target.value }))}
                autoFocus
              />
              <input
                type="password"
                className="w-full rounded-lg border border-slate-400 bg-white px-3.5 py-2.5 text-[15px] font-semibold tracking-widest text-[#111827] outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-500 focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20"
                placeholder="Пароль"
                value={adCreds.bind_password}
                onChange={(e) => setAdCreds((c) => ({ ...c, bind_password: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && loadAdUsers()}
              />
            </div>
            {adErr && <p className="mt-3 text-sm text-rose-600">{adErr}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:border-slate-400" onClick={() => setAdOpen(false)}>Отмена</button>
              <button
                className="rounded-lg bg-[#e63a2e] px-5 py-2 text-sm font-semibold text-white hover:bg-[#c9301f] disabled:opacity-50"
                onClick={loadAdUsers}
                disabled={adBusy || !adCreds.bind_user.trim() || !adCreds.bind_password}
              >
                {adBusy ? 'Поиск в домене…' : 'Найти пользователей'}
              </button>
            </div>
          </div>
        </div>
      )}

      {adOpen && adList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#1f2937]">Пользователи домена ({adList.count})</h3>
            <p className="mt-1 text-xs text-slate-500">Base DN: {adList.base_dn}. Выберите, кого импортировать в портал.</p>

            {/* Фильтр по группам */}
            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                className="w-64 rounded-lg border border-slate-400 bg-white px-3.5 py-2.5 text-[15px] font-semibold text-[#111827] outline-none placeholder:font-normal placeholder:text-slate-500 focus:border-[#e63a2e] focus:ring-2 focus:ring-[#e63a2e]/20"
                  placeholder="Поиск: ФИО, логин, отдел…"
                  value={adFilter}
                  onChange={(e) => setAdFilter(e.target.value)}
                />
                <select
                  className="max-w-72 rounded-lg border border-slate-400 bg-white px-3.5 py-2.5 text-[15px] font-semibold text-[#111827] outline-none focus:border-[#e63a2e]"
                  value={adGroupFilter}
                  onChange={(e) => setAdGroupFilter(e.target.value)}
                >
                  <option value="">Все группы</option>
                  {(adList.groups || []).map((g) => (
                    <option key={g} value={g}>{g}{adList.group_counts?.[g] ? ` (${adList.group_counts[g]})` : ''}</option>
                  ))}
                </select>
                <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-slate-400" onClick={() => setAdSel(new Set((filteredAdUsers || []).map((u) => u.username)))}>
                  Выбрать всех найденных ({(filteredAdUsers || []).length})
                </button>
                <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-slate-400" onClick={() => setAdSel(new Set())}>
                  Снять все
                </button>
              </div>
            </div>

            <div className="mt-3 flex-1 space-y-4 overflow-y-auto rounded-lg border border-slate-200 p-3">
              {(Object.entries(groupedAdUsers).length ? Object.entries(groupedAdUsers) : []).map(([groupKey, usersInGroup]) => (
                <div key={groupKey}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{groupKey}</span>
                    <button
                      className="text-xs text-sky-600 hover:underline"
                      onClick={() => setAdSel((prev) => {
                        const n = new Set(prev);
                        usersInGroup.forEach((u) => n.add(u.username));
                        return n;
                      })}
                    >
                      выбрать всех ({usersInGroup.length})
                    </button>
                  </div>
                  <div className="grid gap-1">
                    {usersInGroup.map((u) => (
                      <label key={u.username} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#e63a2e]"
                          checked={adSel.has(u.username)}
                          onChange={() => setAdSel((prev) => {
                            const n = new Set(prev);
                            if (n.has(u.username)) n.delete(u.username); else n.add(u.username);
                            return n;
                          })}
                        />
                        <span className="font-semibold text-[#1f2937]">{u.full_name || u.username}</span>
                        <span className="text-xs text-slate-400">({u.username})</span>
                        {u.position && <span className="text-xs text-slate-500">· {u.position}</span>}
                        {u.is_admin && <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">админ</span>}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:border-slate-400" onClick={() => setAdOpen(false)}>Отмена</button>
              <button
                className="rounded-lg bg-[#e63a2e] px-5 py-2 text-sm font-semibold text-white hover:bg-[#c9301f] disabled:opacity-50"
                onClick={importAd}
                disabled={adBusy || adSel.size === 0}
              >
                {adBusy ? 'Импорт…' : `Импортировать (${adSel.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== Индивидуальные права (видимые разделы) ==================== */

function PermissionsModal({ user, onClose }) {
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [defaultMode, setDefaultMode] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    authSend(`${API_BASE}/api/admin/sections`, 'GET').then((secs) => {
      setItems((Array.isArray(secs) ? secs : []).filter((s) => s.enabled));
      const sel = new Set(Array.isArray(user.visible_sections) ? user.visible_sections : []);
      setSelected(sel);
      setDefaultMode(!Array.isArray(user.visible_sections));
    });
  }, [user]);

  if (!user) return null;
  const toggle = (path) => {
    setDefaultMode(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      await authSend(`${API_BASE}/api/admin/users/${user.id}`, 'PATCH', {
        visible_sections: defaultMode ? null : [...selected],
      });
      onClose();
      try {
        const me = await authSend(`${API_BASE}/api/auth/me`, 'GET');
        const auth = getAuth();
        if (auth && me) {
          setAuth({ ...auth, user: { ...auth.user, ...me } });
          // если правили сами себя — перезагружаем, чтобы меню и маршруты применились сразу
          if (auth.user?.id === user.id) window.location.reload();
        }
      } catch { /* noop */ }
    } catch (e) {
      alert(`Ошибка: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-[#1f2937]">Права: {user.full_name || user.username}</h3>
        <p className="mt-1 text-xs text-slate-500">Какие разделы портала видны этому пользователю.</p>
        <label className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={defaultMode} onChange={(e) => setDefaultMode(e.target.checked)} />
          Все доступные по роли (по умолчанию)
        </label>
        {!defaultMode && (
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
            {(items || []).map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={selected.has(s.path)} onChange={() => toggle(s.path)} />
                <span>{s.icon || '🔗'} {s.label}</span>
                {s.admin_only && <span className="ml-auto text-xs text-slate-400">(админ)</span>}
              </label>
            ))}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:border-slate-400" onClick={onClose}>Отмена</button>
          <button className="rounded-lg bg-[#e63a2e] px-5 py-2 text-sm font-semibold text-white hover:bg-[#c9301f] disabled:opacity-50" onClick={save} disabled={busy}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}

function SettingsTab() {
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({
    LDAP_SERVER: '', LDAP_DOMAIN: '', LDAP_BASE_DN: '',
    LDAP_ADMIN_GROUPS: '', LDAP_BIRTH_ATTRIBUTE: '', MAIL_DOMAIN: '',
    SMTP_HOST: '', SMTP_PORT: '587', SMTP_SSL: false,
    SMTP_USER: '', SMTP_PASSWORD: '', SMTP_PASSWORD_SET: false,
    MAIL_FROM: '', NOTIFY_EMAIL_TO: '',
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  // тест подключения к домену
  const [test, setTest] = useState({ username: '', password: '' });
  const [testResult, setTestResult] = useState(null);
  const [testBusy, setTestBusy] = useState(false);
  const [testError, setTestError] = useState(null);

  // быстрое подключение домена
  const [disc, setDisc] = useState({ server: '', admin_login: '', admin_password: '' });
  const [discBusy, setDiscBusy] = useState(false);
  const [discResult, setDiscResult] = useState(null);
  const [discError, setDiscError] = useState(null);

  // Резервная копия
  const [backupBusy, setBackupBusy] = useState(null); // 'download' | 'restore' | null
  const [backupMsg, setBackupMsg] = useState(null);  // { ok, text }
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreEnv, setRestoreEnv] = useState(false);

  // Автоматические резервные копии
  const [schedule, setSchedule] = useState(null);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState(null);
  const [triggerBusy, setTriggerBusy] = useState(false);
  const [files, setFiles] = useState([]);

  const downloadBackup = async () => {
    setBackupBusy('download');
    setBackupMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/backup/download`, {
        headers: { Authorization: `Bearer ${getAuth()?.token || ''}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="?([^";]+)"?/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = m ? m[1] : 'monitor-backup.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setBackupMsg({ ok: true, text: 'Резервная копия создана и скачана.' });
    } catch (e) {
      setBackupMsg({ ok: false, text: `Не удалось создать копию: ${e.message}` });
    } finally {
      setBackupBusy(null);
    }
  };

  const restoreBackup = async () => {
    if (!restoreFile) { setBackupMsg({ ok: false, text: 'Выберите файл резервной копии (.zip)' }); return; }
    let warn = 'ВНИМАНИЕ: текущие данные портала будут заменены данными из резервной копии.\nТекущая база сохранится как monitoring.db.pre-restore-… в папке backend (последние 3 копии).';
    if (restoreEnv) warn += '\n\nБудет заменён .env (ключи, SMTP, LDAP): все сессии и токен агентов сбросятся — понадобится повторный вход и обновление токена в агентах.';
    if (!window.confirm(warn)) return;
    setBackupBusy('restore');
    setBackupMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', restoreFile);
      fd.append('include_env', String(restoreEnv));
      const res = await fetch(`${API_BASE}/api/backup/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAuth()?.token || ''}` },
        body: fd,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.detail || `HTTP ${res.status}`);
      setBackupMsg({ ok: true, text: j.warning || 'Резервная копия восстановлена.' });
      setRestoreFile(null);
      setRestoreEnv(false);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setBackupMsg({ ok: false, text: `Не удалось восстановить: ${e.message}` });
    } finally {
      setBackupBusy(null);
    }
  };

  const loadSchedule = async () => {
    try {
      const s = await authFetch(`${API_BASE}/api/backup/schedule`);
      if (s) setSchedule(s);
    } catch (e) { /* ignore */ }
    try {
      const f = await authFetch(`${API_BASE}/api/backup/files`);
      setFiles(Array.isArray(f) ? f : []);
    } catch (e) { /* ignore */ }
  };

  const saveSchedule = async () => {
    setScheduleBusy(true);
    setScheduleMsg(null);
    try {
      await authFetch(`${API_BASE}/api/backup/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule || {}),
      });
      setScheduleMsg({ ok: true, text: 'Расписание сохранено.' });
    } catch (e) {
      setScheduleMsg({ ok: false, text: `Ошибка: ${e.message}` });
    } finally {
      setScheduleBusy(false);
    }
  };

  const triggerBackup = async () => {
    setTriggerBusy(true);
    setScheduleMsg(null);
    try {
      const res = await authFetch(`${API_BASE}/api/backup/trigger`, { method: 'POST' });
      const j = typeof res === 'object' && res !== null ? res : {};
      setScheduleMsg({ ok: true, text: j.file ? `Бэкап создан: ${j.file}` : 'Бэкап создан.' });
      const f = await authFetch(`${API_BASE}/api/backup/files`);
      setFiles(Array.isArray(f) ? f : []);
    } catch (e) {
      setScheduleMsg({ ok: false, text: `Ошибка: ${e.message}` });
    } finally {
      setTriggerBusy(false);
    }
  };

  useEffect(() => {
    loadSchedule();
  }, []);

  const setField = (k) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: value }));
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await authSend(`${API_BASE}/api/settings`, 'PUT', {
        LDAP_SERVER: form.LDAP_SERVER,
        LDAP_DOMAIN: form.LDAP_DOMAIN,
        LDAP_BASE_DN: form.LDAP_BASE_DN,
        LDAP_ADMIN_GROUPS: form.LDAP_ADMIN_GROUPS,
        LDAP_BIRTH_ATTRIBUTE: form.LDAP_BIRTH_ATTRIBUTE,
        MAIL_DOMAIN: form.MAIL_DOMAIN,
        SMTP_HOST: form.SMTP_HOST,
        SMTP_PORT: String(form.SMTP_PORT || '587'),
        SMTP_SSL: !!form.SMTP_SSL,
        SMTP_USER: form.SMTP_USER,
        SMTP_PASSWORD: form.SMTP_PASSWORD || '',
        MAIL_FROM: form.MAIL_FROM,
        NOTIFY_EMAIL_TO: form.NOTIFY_EMAIL_TO,
        LDAP_BIND_USER: form.LDAP_BIND_USER,
        LDAP_BIND_PASSWORD: form.LDAP_BIND_PASSWORD || '',
        SSO_ENABLED: !!form.SSO_ENABLED,
      });
      setSaved(true);
      const s = await authSend(`${API_BASE}/api/settings`, 'GET');
      setForm((f) => ({ ...f, ...s, SMTP_PASSWORD: '' }));
      setTimeout(() => setSaved(false), 4000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    setTestBusy(true);
    setTestError(null);
    setTestResult(null);
    try {
      const r = await authSend(`${API_BASE}/api/settings/test-ldap`, 'POST', test);
      setTestResult(r);
      const s = await authSend(`${API_BASE}/api/settings`, 'GET');
      setForm((f) => ({ ...f, ...s, SMTP_PASSWORD: '' }));
    } catch (e) {
      setTestError(e.message);
    } finally {
      setTestBusy(false);
    }
  };

  const runDiscover = async () => {
    setDiscBusy(true);
    setDiscError(null);
    setDiscResult(null);
    try {
      const r = await authSend(`${API_BASE}/api/settings/discover`, 'POST', disc);
      setDiscResult(r);
      const s = await authSend(`${API_BASE}/api/settings`, 'GET');
      setForm((f) => ({ ...f, ...s, SMTP_PASSWORD: '' }));
    } catch (e) {
      setDiscError(e.message);
    } finally {
      setDiscBusy(false);
    }
  };

  if (!loaded) {
    return <div className="skeleton h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      {/* Быстрое подключение домена */}
      <div className="rounded-xl border-2 border-[#2b3a4b]/20 bg-gradient-to-br from-[#2b3a4b] to-[#1e293b] p-6 text-white shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xl">⚡</span>
          <h2 className="font-bold">Быстрое подключение домена</h2>
        </div>
        <p className="text-sm text-white/70">
          Укажите только адрес контроллера домена и учётку администратора — остальное
          (Base DN, NetBIOS-имя, группы админов) портал определит сам и включит доменную авторизацию.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <input
            className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/50"
            placeholder="Адрес домена: dc01.corp.local"
            value={disc.server}
            onChange={(e) => setDisc((d) => ({ ...d, server: e.target.value }))}
          />
          <input
            className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/50"
            placeholder="Логин админа: admin@corp.local"
            value={disc.admin_login}
            onChange={(e) => setDisc((d) => ({ ...d, admin_login: e.target.value }))}
          />
          <input
            type="password"
            className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/50"
            placeholder="Пароль администратора"
            value={disc.admin_password}
            onChange={(e) => setDisc((d) => ({ ...d, admin_password: e.target.value }))}
          />
        </div>
        <button
          className="mt-4 rounded-lg bg-[#e63a2e] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#c9301f] disabled:opacity-50"
          onClick={runDiscover}
          disabled={discBusy || !disc.server.trim() || !disc.admin_login.trim() || !disc.admin_password}
        >
          {discBusy ? 'Подключение и настройка…' : '⚡ Подключить домен автоматически'}
        </button>
        {discError && (
          <p className="mt-3 rounded-lg border border-rose-400/40 bg-rose-500/20 px-4 py-2.5 text-sm text-rose-100">{discError}</p>
        )}
        {discResult && (
          <div className="mt-3 rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-4 py-3 text-sm text-emerald-50">
            <p className="font-semibold">✅ {discResult.message}</p>
            <p className="mt-1">Базовый DN: {discResult.base_dn}</p>
            <p>NetBIOS-имя: {discResult.netbios} · DNS-домен: {discResult.dns_domain || '—'}</p>
            <p>Группы админов: {discResult.admin_groups.join(', ') || '—'}</p>
            <p>Проверка учётки: {discResult.admin_check.full_name} · {discResult.admin_check.email || '—'}</p>
          </div>
        )}
      </div>

      {/* Автовход Windows */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="h-4 w-1 rounded-full bg-[#e63a2e]" />
          <h2 className="font-bold text-[#1f2937]">Автовход Windows (SSO)</h2>
        </div>
        <label className="flex items-center gap-3 text-sm text-slate-600">
          <Toggle checked={!!form.SSO_ENABLED} onChange={(v) => setForm((f) => ({ ...f, SSO_ENABLED: v }))} />
          Пользователь, уже вошедший в Windows под доменной учёткой, попадает на портал автоматически — без ввода пароля.
        </label>
        <p className="mt-2 text-xs text-slate-400">
          Кнопка «Войти через Windows» появится на странице входа. Для срабатывания автовхода браузер должен
          считать адрес портала «Местной интрасетью» (по умолчанию так для имён вида http://имя-сервера).
        </p>
      </div>

      {/* Домен AD */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="h-4 w-1 rounded-full bg-[#e63a2e]" />
          <h2 className="font-bold text-[#1f2937]">Домен Active Directory</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Адрес контроллера домена</span>
            <input className={inputCls} placeholder="ldap://dc01.corp.local:389" value={form.LDAP_SERVER} onChange={setField('LDAP_SERVER')} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">NetBIOS-имя домена</span>
            <input className={inputCls} placeholder="CORP (вход: CORP\ivanov)" value={form.LDAP_DOMAIN} onChange={setField('LDAP_DOMAIN')} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Базовый DN</span>
            <input className={inputCls} placeholder="DC=corp,DC=local" value={form.LDAP_BASE_DN} onChange={setField('LDAP_BASE_DN')} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Группы администраторов (через запятую)</span>
            <input className={inputCls} placeholder="ИТ-Администраторы,Domain Admins" value={form.LDAP_ADMIN_GROUPS} onChange={setField('LDAP_ADMIN_GROUPS')} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Атрибут даты рождения в AD (необязательно)</span>
            <input className={inputCls} placeholder="extensionAttribute1" value={form.LDAP_BIRTH_ATTRIBUTE} onChange={setField('LDAP_BIRTH_ATTRIBUTE')} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Почтовый домен по умолчанию</span>
            <input className={inputCls} placeholder="corp.local" value={form.MAIL_DOMAIN} onChange={setField('MAIL_DOMAIN')} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Служебная учётка AD (для поиска ФИО при автовходе)</span>
            <input className={inputCls} placeholder="portal@corp.local или CORP\portal" value={form.LDAP_BIND_USER} onChange={setField('LDAP_BIND_USER')} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Пароль служебной учётки {form.LDAP_BIND_PASSWORD_SET && '(сохранён — пусто = не менять)'}
            </span>
            <input type="password" className={inputCls} placeholder={form.LDAP_BIND_PASSWORD_SET ? '••••••••' : 'пароль'} value={form.LDAP_BIND_PASSWORD} onChange={setField('LDAP_BIND_PASSWORD')} />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Вход сотрудников выполняется по логину и паролю домена. Пользователи из перечисленных групп автоматически
          получают права администратора портала (мониторинг ИТ, админ-панель).
        </p>
      </div>

      {/* Тест подключения */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-6">
        <h3 className="font-bold text-[#1f2937]">Проверка подключения к домену</h3>
        <p className="mt-1 text-xs text-slate-500">Введите логин и пароль любой доменной учётки — портал проверит связь и покажет данные из AD.</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Доменный логин</span>
            <input className={`${inputCls} w-48`} placeholder="ivanov" value={test.username} onChange={(e) => setTest((t) => ({ ...t, username: e.target.value }))} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Пароль</span>
            <input type="password" className={`${inputCls} w-48`} placeholder="••••••••" value={test.password} onChange={(e) => setTest((t) => ({ ...t, password: e.target.value }))} />
          </label>
          <button
            className="rounded-lg bg-[#2b3a4b] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#e63a2e] disabled:opacity-50"
            onClick={runTest}
            disabled={testBusy || !test.username.trim() || !test.password}
          >
            {testBusy ? 'Проверка…' : 'Проверить'}
          </button>
        </div>
        {testError && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600">{testError}</p>
        )}
        {testResult && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p className="font-semibold">✅ Подключение успешно</p>
            <p className="mt-1">ФИО: {testResult.full_name} · E-mail: {testResult.email || '—'} · Отдел: {testResult.department || '—'}</p>
            <p>Группы AD: {testResult.groups.length ? testResult.groups.join(', ') : '—'}</p>
            <p className={testResult.is_admin ? 'font-semibold text-emerald-700' : ''}>
              {testResult.is_admin ? 'Пользователь входит в группу админов → получит роль администратора' : 'Обычный сотрудник'}
            </p>
          </div>
        )}
      </div>

      {/* Почта */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="h-4 w-1 rounded-full bg-[#e63a2e]" />
          <h2 className="font-bold text-[#1f2937]">Почтовый сервер (уведомления о заявках)</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">SMTP-сервер</span>
            <input className={inputCls} placeholder="smtp.corp.local" value={form.SMTP_HOST} onChange={setField('SMTP_HOST')} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Порт</span>
            <input className={inputCls} placeholder="587" value={form.SMTP_PORT} onChange={setField('SMTP_PORT')} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Логин SMTP</span>
            <input className={inputCls} placeholder="portal@corp.local (если нужна авторизация)" value={form.SMTP_USER} onChange={setField('SMTP_USER')} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Пароль SMTP {form.SMTP_PASSWORD_SET && '(сохранён — оставьте пустым, чтобы не менять)'}
            </span>
            <input type="password" className={inputCls} placeholder={form.SMTP_PASSWORD_SET ? '••••••••' : 'пароль (если нужен)'} value={form.SMTP_PASSWORD} onChange={setField('SMTP_PASSWORD')} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Адрес отправителя (From)</span>
            <input className={inputCls} placeholder="portal@corp.local" value={form.MAIL_FROM} onChange={setField('MAIL_FROM')} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Куда слать уведомления о заявках</span>
            <input className={inputCls} placeholder="helpdesk@corp.local" value={form.NOTIFY_EMAIL_TO} onChange={setField('NOTIFY_EMAIL_TO')} />
          </label>
        </div>
        <label className="mt-4 flex items-center gap-3 text-sm text-slate-600">
          <Toggle checked={!!form.SMTP_SSL} onChange={(v) => setForm((f) => ({ ...f, SMTP_SSL: v }))} />
          Использовать SSL (порт 465). Иначе TLS/STARTTLS (порт 587).
        </label>
        <p className="mt-2 text-xs text-slate-400">
          Если SMTP-сервер не указан, уведомления сохраняются в папку backend/outbox в формате .eml — их можно открыть в Outlook.
        </p>
      </div>

      {/* Резервная копия */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-[#1f2937]">🗄 Резервная копия</h2>
        <p className="mt-1 text-sm text-slate-500">
          Копия включает: базу данных (пользователи, заявки, задачи, телефонный справочник, новости, настройки),
          файл конфигурации .env и загрушенные файлы (картинки новостей, логотип).
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded-lg bg-[#2b3a4b] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1e293b] disabled:opacity-50"
            onClick={downloadBackup}
            disabled={backupBusy !== null}
          >
            {backupBusy === 'download' ? 'Создание…' : '⬇️ Скачать резервную копию'}
          </button>
          <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50">
            {backupBusy === 'restore' ? 'Восстановление…' : '⬆️ Восстановить из файла'}
            <input
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
            />
          </label>
          {restoreFile && <span className="text-xs text-slate-500">{restoreFile.name}</span>}
        </div>
        <label className="mt-3 flex items-start gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[#e63a2e]"
            checked={restoreEnv}
            onChange={(e) => setRestoreEnv(e.target.checked)}
          />
          Восстановить также .env (конфигурация: ключи, SMTP, LDAP) — сбросит токен агентов и все сессии
        </label>
        {backupMsg && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${backupMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
            {backupMsg.text}
          </p>
        )}
      </div>

      {/* Сохранение */}
      <div className="sticky bottom-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="rounded-lg bg-[#e63a2e] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#c9301f] disabled:opacity-50"
            onClick={save}
            disabled={busy}
          >
            {busy ? 'Сохранение…' : 'Сохранить настройки'}
          </button>
          {saved && (
            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
              ✅ Настройки сохранены и применены без перезапуска
            </span>
          )}
          {error && <span className="text-sm text-rose-600">{error}</span>}
        </div>
      </div>
    </div>
  );
}

/* ==================== Интерфейс (логотип, фон, цвета) ==================== */

function UITab() {
  const [form, setForm] = useState({ LOGO_PATH: '', HERO_BG_IMAGE: '', HERO_BG_OPACITY: '0.35', HERO_BG_BLUR: '0', HERO_TITLE_COLOR: '', PANEL_BG: '' });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    authSend(`${API_BASE}/api/ui/settings`, 'GET')
      .then((s) => setForm((f) => ({ ...f, ...s })))
      .catch((e) => setError(e.message));
  }, []);

  const setField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const upload = async (file, key) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const auth = getAuth();
      const res = await fetch(`${API_BASE}/api/ui/upload`, {
        method: 'POST',
        headers: auth?.token ? { Authorization: `Bearer ${auth.token}` } : undefined,
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.detail === 'string' ? d.detail : 'Ошибка загрузки');
      }
      const { path } = await res.json();
      setForm((f) => ({ ...f, [key]: path }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await authSend(`${API_BASE}/api/ui/settings`, 'PUT', form);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const clear = (key) => setForm((f) => ({ ...f, [key]: '' }));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="h-4 w-1 rounded-full bg-[#e63a2e]" />
          <h2 className="text-base font-bold text-[#1f2937]">Внешний вид портала</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {/* Логотип */}
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Логотип</p>
            <div className="flex items-center gap-3">
              {form.LOGO_PATH
                ? <img src={form.LOGO_PATH} alt="" className="h-14 w-auto rounded-lg bg-white object-contain shadow-sm" />
                : <span className="text-xs text-slate-400">по умолчанию /logo.png</span>}
              <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-[#e63a2e] hover:text-[#e63a2e]">
                Выбрать файл
                <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], 'LOGO_PATH')} />
              </label>
              {form.LOGO_PATH && (
                <button className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:border-rose-300 hover:text-rose-600" onClick={() => clear('LOGO_PATH')}>Сбросить</button>
              )}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Логотип автоматически вписывается в шапку (высота 40px), пропорции сохраняются.</p>
          </div>

          {/* Фон приветственного блока */}
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Фон блока «Здравствуйте, …»</p>
            <div className="flex items-center gap-3">
              {form.HERO_BG_IMAGE
                ? <img src={form.HERO_BG_IMAGE} alt="" className="h-14 w-24 rounded-lg object-cover" />
                : <span className="text-xs text-slate-400">стандартный тёмный градиент</span>}
              <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-[#e63a2e] hover:text-[#e63a2e]">
                Выбрать файл
                <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], 'HERO_BG_IMAGE')} />
              </label>
              {form.HERO_BG_IMAGE && (
                <button className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:border-rose-300 hover:text-rose-600" onClick={() => clear('HERO_BG_IMAGE')}>Сбросить</button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400">Затемнение: {Math.round(parseFloat(form.HERO_BG_OPACITY || 0) * 100)}%</span>
                <input type="range" min="0" max="1" step="0.05" value={form.HERO_BG_OPACITY || '0.35'} onChange={setField('HERO_BG_OPACITY')} className="w-full accent-[#e63a2e]" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400">Размытие: {form.HERO_BG_BLUR || 0}px</span>
                <input type="range" min="0" max="20" step="1" value={form.HERO_BG_BLUR || '0'} onChange={setField('HERO_BG_BLUR')} className="w-full accent-[#e63a2e]" />
              </label>
            </div>
          </div>

          {/* Цвет заголовка */}
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Цвет заголовка приветствия</p>
            <div className="flex items-center gap-3">
              <input type="color" value={form.HERO_TITLE_COLOR || '#ffffff'} onChange={setField('HERO_TITLE_COLOR')} className="h-9 w-12 cursor-pointer rounded border border-slate-300 p-0.5" />
              <input className={inputCls + ' max-w-[140px]'} placeholder="#ffffff или оставьте пустым" value={form.HERO_TITLE_COLOR} onChange={setField('HERO_TITLE_COLOR')} />
              {form.HERO_TITLE_COLOR && (
                <button className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:border-rose-300 hover:text-rose-600" onClick={() => clear('HERO_TITLE_COLOR')}>Сбросить</button>
              )}
            </div>
          </div>

          {/* Фон серых блоков */}
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Фон серых блоков (карточки)</p>
            <div className="flex items-center gap-3">
              <input type="color" value={form.PANEL_BG || '#f1f5f9'} onChange={setField('PANEL_BG')} className="h-9 w-12 cursor-pointer rounded border border-slate-300 p-0.5" />
              <input className={inputCls + ' max-w-[140px]'} placeholder="#f1f5f9 (пусто = по умолчанию)" value={form.PANEL_BG} onChange={setField('PANEL_BG')} />
              {form.PANEL_BG && (
                <button className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:border-rose-300 hover:text-rose-600" onClick={() => clear('PANEL_BG')}>Сбросить</button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button className="rounded-lg bg-[#e63a2e] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#c9301f] disabled:opacity-50" onClick={save} disabled={busy}>
            {busy ? 'Сохранение…' : 'Сохранить'}
          </button>
          {saved && <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700">✅ Применено — обновите страницу портала</span>}
          {error && <span className="text-sm text-rose-600">{error}</span>}
        </div>
      </div>
    </div>
  );
}

/* ==================== Новости ==================== */

function NewsTab() {
  const authHeaders = useMemo(() => {
    const t = getAuth()?.token;
    return t ? { Authorization: `Bearer ${t}` } : undefined;
  }, []);
  const q = useFetch(`${API_BASE}/api/news?limit=50`, { interval: 0, headers: authHeaders });
  const { data, error, refetch } = q;
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', body_html: '', pinned: false });
  const [imagePath, setImagePath] = useState(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [editorKey, setEditorKey] = useState(0); // изменение = сброс редактора (после публикации)

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); refetch(); } catch (e) { alert(`Ошибка: ${e.message}`); } finally { setBusy(false); }
  };

  const add = () => run(async () => {
    if (!form.title.trim()) throw new Error('Укажите заголовок');
    await authSend(`${API_BASE}/api/news`, 'POST', {
      title: form.title.trim(), body: form.body.trim() || null,
      body_html: form.body_html || null, image: imagePath, pinned: form.pinned,
    });
    setForm({ title: '', body: '', body_html: '', pinned: false });
    setImagePath(null);
    setEditorKey((k) => k + 1);
  });

  const uploadImage = async (file) => {
    if (!file) return;
    setImgBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const auth = getAuth();
      const res = await fetch(`${API_BASE}/api/news/image`, {
        method: 'POST',
        headers: auth?.token ? { Authorization: `Bearer ${auth.token}` } : undefined,
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.detail === 'string' ? d.detail : 'Ошибка загрузки');
      }
      const { path } = await res.json();
      setImagePath(path);
    } catch (e) {
      alert(`Ошибка: ${e.message}`);
    } finally {
      setImgBusy(false);
    }
  };

  const news = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-bold text-[#1f2937]">Новая новость (появится на главной у всех сотрудников)</h2>
        <div className="space-y-3">
          <input className={inputCls} placeholder="Заголовок *" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={form.pinned} onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))} />
              Закрепить сверху
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[#2b3a4b]">
              <span className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium transition-colors hover:border-[#e63a2e] hover:text-[#e63a2e]">
                🖼 {imgBusy ? 'Загрузка…' : imagePath ? 'Заменить обложку' : 'Обложка новости'}
              </span>
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => uploadImage(e.target.files?.[0])} disabled={imgBusy} />
            </label>
            {imagePath && <img src={imagePath} alt="" className="h-12 rounded-lg object-cover" />}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Текст новости (Word-редактор)</p>
            <RichEditor
              key={editorKey}
              value={form.body_html}
              onChange={(html) => setForm((f) => ({ ...f, body_html: html }))}
            />
          </div>
          <div className="flex justify-end">
            <button className="rounded-lg bg-[#e63a2e] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#c9301f] disabled:opacity-50" onClick={add} disabled={busy}>
              Опубликовать
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">Не удалось загрузить новости: {error}</div>
      )}

      <div className="space-y-3">
        {news.map((n) => (
          <article key={n.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              {n.pinned === 1 || n.pinned === true ? <span className="rounded-full border border-[#e63a2e]/30 bg-[#e63a2e]/5 px-2 py-0.5 text-xs font-bold uppercase text-[#e63a2e]">важно</span> : null}
              <h3 className="font-bold text-[#1f2937]">{n.title}</h3>
              <div className="ml-auto flex items-center gap-2">
                <button
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-400"
                  onClick={() => run(async () => { await authSend(`${API_BASE}/api/news/${n.id}`, 'PATCH', { pinned: !(n.pinned === 1 || n.pinned === true) }); })}
                >
                  {(n.pinned === 1 || n.pinned === true) ? 'Открепить' : 'Закрепить'}
                </button>
                <button
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-rose-300 hover:text-rose-600"
                  onClick={() => window.confirm('Удалить новость?') && run(async () => { await authSend(`${API_BASE}/api/news/${n.id}`, 'DELETE'); })}
                >
                  Удалить
                </button>
              </div>
            </div>
            {n.image && <img src={n.image} alt="" className="mt-2 max-h-44 w-full rounded-lg object-cover" />}
            {n.body_html ? (
              <div className="news-rich mt-2 text-sm leading-relaxed text-slate-600" dangerouslySetInnerHTML={{ __html: n.body_html }} />
            ) : (n.body && <p className="mt-1.5 text-sm text-slate-600">{n.body}</p>)}
            <p className="mt-1 text-xs text-slate-400">{n.author} · {new Date(n.created_at).toLocaleString('ru-RU')}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
