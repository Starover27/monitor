/**
 * NewTaskModal — окно создания задачи (календарь-органайзер).
 * - галочки: несколько сотрудников и/или целые отделы
 * - срок и описание
 * - внутренний документ: перетащить файл мышкой — путь подставится сам
 *   (браузер не видит полный UNC-путь, поэтому имя файла складывается
 *   с выбранным «корнем» внутренней сети; корень можно добавить/сменить)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { authSend } from '../lib/portal-auth';
import { API_BASE } from '../lib/api';

const ROOTS_KEY = 'portal.internal-doc-roots';
const DEFAULT_ROOTS = ['\\\\192.168.89.2\\Системные администраторы'];

function loadRoots() {
  try {
    const raw = JSON.parse(localStorage.getItem(ROOTS_KEY) || 'null');
    if (Array.isArray(raw) && raw.length) return raw;
  } catch { /* noop */ }
  return DEFAULT_ROOTS;
}

export default function NewTaskModal({ people, myName, defaultDue, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [due, setDue] = useState(defaultDue || '');
  const [toSelf, setToSelf] = useState(true);
  const [selected, setSelected] = useState(() => new Set());
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // документ
  const [roots, setRoots] = useState(loadRoots);
  const [rootIdx, setRootIdx] = useState(0);
  const [newRoot, setNewRoot] = useState('');
  const [docName, setDocName] = useState(null); // имя перетащенного файла
  const [docPath, setDocPath] = useState('');   // ручной путь (при редактировании)
  const [dropHot, setDropHot] = useState(false);
  const dropRef = useRef(null);

  // Esc закрывает окно
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const saveRoots = (next) => {
    setRoots(next);
    try { localStorage.setItem(ROOTS_KEY, JSON.stringify(next)); } catch { /* noop */ }
  };

  const docPathComputed = useMemo(() => {
    if (docName) {
      const root = (roots[rootIdx] || '').replace(/\\+$/, '');
      return root ? `${root}\\${docName}` : docName;
    }
    return docPath;
  }, [docName, docPath, rootIdx, roots]);

  const onDrop = (e) => {
    e.preventDefault();
    setDropHot(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) setDocName(file.name);
  };

  const groups = useMemo(() => {
    const map = {};
    for (const p of people) {
      if (filter && !p.full_name.toLowerCase().includes(filter.toLowerCase())) continue;
      const d = p.department || 'Без отдела';
      (map[d] = map[d] || []).push(p);
    }
    return Object.entries(map).sort(([a], [b]) =>
      a === 'Без отдела' ? 1 : b === 'Без отдела' ? -1 : a.localeCompare(b, 'ru'));
  }, [people, filter]);

  const allNames = (dept) => (groups.find(([d]) => d === dept) || [null, []])[1].map((p) => p.full_name);
  const deptState = (dept) => {
    const names = allNames(dept);
    const cnt = names.filter((n) => selected.has(n)).length;
    return { all: cnt === names.length && names.length > 0, some: cnt > 0 && cnt < names.length, cnt };
  };

  const toggleDept = (dept) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const names = allNames(dept);
      if (names.every((n) => next.has(n))) names.forEach((n) => next.delete(n));
      else names.forEach((n) => next.add(n));
      return next;
    });
  };
  const togglePerson = (name) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const recipients = toSelf
    ? [myName, ...selected]
    : [...selected];

  const submit = async () => {
    if (!title.trim()) { setError('Введите текст задачи'); return; }
    if (recipients.length === 0) { setError('Выберите, кому назначить задачу (галочки)'); return; }
    setBusy(true);
    setError(null);
    try {
      await authSend(`${API_BASE}/api/tasks`, 'POST', {
        title: title.trim(),
        details: details.trim() || null,
        due_date: due || null,
        assignees: recipients,
        document_url: docPathComputed.trim() || null,
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3.5">
          <h3 className="text-base font-bold text-[#1f2937]">Новая задача</h3>
          <button className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" onClick={onClose}>✕</button>
        </div>

        <div className="space-y-4 p-5">
          {/* Текст задачи */}
          <div className="space-y-2">
            <input
              autoFocus
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-black outline-none focus:border-[#e63a2e]"
              placeholder="Что сделать?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-black outline-none focus:border-[#e63a2e]"
              placeholder="Описание (необязательно)"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500">Срок:</label>
              <input
                type="date"
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-black outline-none focus:border-[#e63a2e]"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </div>
          </div>

          {/* Кому: галочки по отделам и сотрудникам */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Кому назначить</p>
              <button
                type="button"
                className={`text-xs font-semibold ${toSelf ? 'text-[#e63a2e]' : 'text-slate-400 hover:text-slate-600'}`}
                onClick={() => setToSelf((v) => !v)}
              >
                {toSelf ? '✓' : ''} и себе
              </button>
            </div>
            <input
              className="mb-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-black outline-none focus:border-[#e63a2e]"
              placeholder="Поиск сотрудника…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
              {groups.map(([dept, members]) => {
                const st = deptState(dept);
                return (
                  <div key={dept}>
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-100">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#e63a2e]"
                        checked={st.all}
                        ref={(el) => { if (el) el.indeterminate = st.some; }}
                        onChange={() => toggleDept(dept)}
                      />
                      <span className="text-xs font-bold text-[#2b3a4b]">{dept}</span>
                      <span className="text-[10px] text-slate-400">({st.cnt}/{members.length})</span>
                    </label>
                    <div className="ml-6 space-y-0.5">
                      {members.map((p) => (
                        <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-100">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-[#e63a2e]"
                            checked={selected.has(p.full_name)}
                            onChange={() => togglePerson(p.full_name)}
                          />
                          <span className="truncate text-xs text-slate-700">{p.full_name}</span>
                          {p.full_name === myName && <span className="text-[10px] text-slate-400">(вы)</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {groups.length === 0 && <p className="py-2 text-center text-xs text-slate-400">Никого не найдено</p>}
            </div>
          </div>

          {/* Внутренний документ */}
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">Документ (внутренняя сеть)</p>
            <div
              ref={dropRef}
              onDragOver={(e) => { e.preventDefault(); setDropHot(true); }}
              onDragLeave={() => setDropHot(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-3 text-center transition-colors ${
                dropHot ? 'border-[#e63a2e] bg-red-50' : 'border-slate-300 bg-slate-50 hover:border-slate-400'
              }`}
              onClick={() => dropRef.current?.focus()}
            >
              <span className="text-lg">{docName ? '📎' : '📄'}</span>
              <div className="text-left">
                <p className="text-xs font-semibold text-[#1f2937]">
                  {docName ? docName : 'Перетащите документ сюда мышкой'}
                </p>
                <p className="text-[10px] text-slate-400">
                  {docName ? 'имя файла взято автоматически — путь соберётся из корня ниже' : 'например, .xls / .docx со share'}
                </p>
              </div>
            </div>

            <div className="mt-2 flex gap-1.5">
              <select
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-black outline-none focus:border-[#e63a2e]"
                value={rootIdx}
                onChange={(e) => setRootIdx(Number(e.target.value))}
                title="Корень внутренней сети (к имени файла добавится выбранный корень)"
              >
                {roots.map((r, i) => <option key={i} value={i}>{r}</option>)}
              </select>
              <button
                type="button"
                className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-500 hover:bg-slate-100"
                title="Убрать выбранный документ"
                onClick={() => { setDocName(null); setDocPath(''); }}
              >✕</button>
            </div>
            <input
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-600 outline-none focus:border-[#e63a2e] focus:bg-white"
              placeholder="Путь появится сам после переноса документа (можно поправить вручную)"
              value={docPathComputed}
              onChange={(e) => { setDocPath(e.target.value); setDocName(null); }}
            />
            <div className="mt-1.5 flex gap-1.5">
              <input
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-black outline-none focus:border-[#e63a2e]"
                placeholder="+ новый корень: \\\\<сервер>\<папка>"
                value={newRoot}
                onChange={(e) => setNewRoot(e.target.value)}
              />
              <button
                type="button"
                className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                onClick={() => {
                  const v = newRoot.trim().replace(/\\+$/, '');
                  if (!v) return;
                  const next = roots.includes(v) ? roots : [...roots, v];
                  saveRoots(next);
                  setRootIdx(next.indexOf(v));
                  setNewRoot('');
                }}
              >добавить</button>
            </div>
          </div>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>}

          {/* Кнопки */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[11px] text-slate-400">
              {recipients.length > 0 ? `Получателей: ${recipients.length}` : 'Получатели не выбраны'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                onClick={onClose}
              >Отмена</button>
              <button
                type="button"
                className="rounded-lg bg-[#e63a2e] px-5 py-2 text-xs font-bold text-white hover:bg-[#c9301f] disabled:opacity-50"
                onClick={submit}
                disabled={busy}
              >{busy ? 'Создание…' : '➕ Назначить'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
