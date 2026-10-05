/**
 * RichEditor — простой WYSIWYG-редактор новостей (аналог Word: жирный, курсив,
 * заголовки, списки, ссылки, картинки, выравнивание, цвет).
 * Работает через contentEditable + document.execCommand.
 *
 * ВАЖНО: value используется только для первичной установки и полной замены
 * (сброс формы). На каждый ввод НЕ перезаписываем innerHTML значением value —
 * это ломает каретку и вызывает задвоение/перескакивание символов при вводе
 * (в т.ч. кириллицы через IME/раскладки). Ключ valueKey форсирует синхронизацию
 * только когда HTML реально заменён извне.
 */
import { useEffect, useRef, useState } from 'react';

const TOOL_BTN = 'rounded px-2 py-1 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-[#e63a2e]';

export default function RichEditor({ value, onChange, onImageUploaded, valueKey }) {
  const ref = useRef(null);
  const [showLink, setShowLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const lastSynced = useRef(value ?? '');

  // Синхронизируем содержимое только при внешней замене (сброс/редактирование другой новости).
  useEffect(() => {
    const incoming = value ?? '';
    if (ref.current && incoming !== lastSynced.current && incoming !== ref.current.innerHTML) {
      ref.current.innerHTML = incoming;
      lastSynced.current = incoming;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKey]);

  const exec = (cmd, arg = null) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };

  const emit = () => {
    if (ref.current) onChange(ref.current.innerHTML);
  };

  // Вставка картинки (upload на /api/news/image)
  const insertImage = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { getAuth } = await import('../lib/portal-auth');
      const auth = getAuth();
      const res = await fetch(`${(await import('../lib/api')).API_BASE}/api/news/image`, {
        method: 'POST',
        headers: auth?.token ? { Authorization: `Bearer ${auth.token}` } : undefined,
        body: fd,
      });
      if (!res.ok) throw new Error('Ошибка загрузки');
      const { path } = await res.json();
      exec('insertImage', path);
      onImageUploaded?.(path);
    } catch (e) {
      alert(`Ошибка: ${e.message}`);
    }
  };

  const applyLink = () => {
    if (linkUrl.trim()) {
      exec('createLink', linkUrl.trim());
    }
    setShowLink(false);
    setLinkUrl('');
  };

  return (
    <div className="rounded-xl border border-slate-300 bg-white shadow-sm">
      {/* Панель инструментов */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        <select
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm font-semibold text-[#111827] outline-none"
          onChange={(e) => {
            if (e.target.value) exec('formatBlock', e.target.value);
            e.target.value = '';
          }}
          defaultValue=""
        >
          <option value="">Стиль</option>
          <option value="h1">Заголовок 1</option>
          <option value="h2">Заголовок 2</option>
          <option value="h3">Заголовок 3</option>
          <option value="p">Обычный текст</option>
          <option value="blockquote">Цитата</option>
        </select>
        <button className={TOOL_BTN} title="Жирный" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}><b>Ж</b></button>
        <button className={`${TOOL_BTN} italic`} title="Курсив" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}>К</button>
        <button className={`${TOOL_BTN} underline`} title="Подчёркнутый" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}>Ч</button>
        <span className="mx-1 h-5 w-px bg-slate-300" />
        <button className={TOOL_BTN} title="Маркированный список" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')}>• —</button>
        <button className={TOOL_BTN} title="Нумерованный список" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertOrderedList')}>1. —</button>
        <span className="mx-1 h-5 w-px bg-slate-300" />
        <button className={TOOL_BTN} title="По левому краю" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyLeft')}>⬅</button>
        <button className={TOOL_BTN} title="По центру" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyCenter')}>↔</button>
        <button className={TOOL_BTN} title="По правому краю" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('justifyRight')}>➡</button>
        <span className="mx-1 h-5 w-px bg-slate-300" />
        <button className={TOOL_BTN} title="Ссылка" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowLink((v) => !v)}>🔗</button>
        <label className={TOOL_BTN + ' cursor-pointer'} title="Вставить картинку" onMouseDown={(e) => e.preventDefault()}>
          🖼
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden"
            onChange={(e) => insertImage(e.target.files?.[0])} />
        </label>
        <input
          type="color" title="Цвет текста" className="h-7 w-7 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
          onMouseDown={(e) => e.preventDefault()}
          onChange={(e) => exec('foreColor', e.target.value)}
        />
        <span className="mx-1 h-5 w-px bg-slate-300" />
        <button className={TOOL_BTN} title="Убрать форматирование" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('removeFormat')}>⌫ Aa</button>
        <button className={TOOL_BTN} title="Горизонтальная линия" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertHorizontalRule')}>―</button>
      </div>

      {showLink && (
        <div className="flex items-center gap-2 border-b border-slate-200 bg-amber-50 px-3 py-2">
          <input
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm outline-none"
            placeholder="https://…"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyLink()}
            autoFocus
          />
          <button className="rounded bg-[#e63a2e] px-3 py-1 text-xs font-semibold text-white" onClick={applyLink}>OK</button>
          <button className="rounded border border-slate-300 px-2 py-1 text-xs" onClick={() => setShowLink(false)}>Отмена</button>
        </div>
      )}

      {/* Редактируемая область */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => {
          lastSynced.current = e.currentTarget.innerHTML;
          emit();
        }}
        onBlur={emit}
        className="prose-news min-h-[220px] max-h-[60vh] overflow-y-auto px-4 py-3 text-sm leading-relaxed text-slate-700 outline-none"
        dangerouslySetInnerHTML={{ __html: value || '' }}
      />
    </div>
  );
}
