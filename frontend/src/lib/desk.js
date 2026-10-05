/**
 * desk.js — общие константы и хелперы хелпдеска и портала (светлый корпоративный стиль)
 */

export const TICKET_STATUS_LABELS = {
  new: 'Новая',
  in_progress: 'В работе',
  done: 'Выполнена',
  cancelled: 'Отменена',
};

export const TICKET_STATUS_STYLES = {
  new: 'bg-sky-100 text-sky-700 border-sky-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  done: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

export const TICKET_PRIORITY_LABELS = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
  critical: 'Критичный',
};

export const TICKET_PRIORITY_STYLES = {
  low: 'bg-slate-100 text-slate-500 border-slate-200',
  normal: 'bg-sky-100 text-sky-700 border-sky-200',
  high: 'bg-amber-100 text-amber-700 border-amber-200',
  critical: 'bg-rose-100 text-rose-700 border-rose-200',
};

export const TICKET_CATEGORY_LABELS = {
  pc: 'Компьютер / техника',
  network: 'Сеть / интернет',
  software: 'Программы',
  printer: 'Принтер / оргтехника',
  phone: 'Телефон / связь',
  access: 'Доступы',
  other: 'Другое',
};

export const TICKET_TRACK_STEPS = ['new', 'in_progress', 'done'];
export const TICKET_TRACK_STEP_LABELS = { new: 'Создана', in_progress: 'В работе', done: 'Выполнена' };

export const PORTAL_KIND_LABELS = {
  vacation: 'Отпуск',
  sick_leave: 'Больничный',
  dayoff: 'Отгул',
  business_trip: 'Командировка',
  certificate: 'Справка',
  material_aid: 'Материальная помощь',
  personnel: 'Кадровый вопрос',
  statement: 'Заявление',
  other: 'Другое',
};

export const PORTAL_KIND_ICONS = {
  vacation: '🌴',
  sick_leave: '🏥',
  dayoff: '⏱',
  business_trip: '✈️',
  certificate: '📄',
  material_aid: '🤝',
  personnel: '👥',
  statement: '✍️',
  other: '📋',
};

export const PORTAL_KIND_DESC = {
  vacation: 'Заявление на очередной оплачиваемый отпуск',
  sick_leave: 'Оформление листка нетрудоспособности',
  dayoff: 'Отгул или день без сохранения зарплаты',
  business_trip: 'Заявление на служебную командировку',
  certificate: 'Справка с места работы, 2-НДФЛ и другие',
  material_aid: 'Ходатайство о материальной помощи',
  personnel: 'Кадровые и административные вопросы',
  statement: 'Любое другое заявление в свободной форме',
  other: 'Другие обращения',
};

export const PORTAL_STATUS_LABELS = {
  new: 'Принято',
  in_progress: 'На рассмотрении',
  done: 'Одобрено',
  rejected: 'Отклонено',
};

export const PORTAL_STATUS_STYLES = {
  new: 'bg-sky-100 text-sky-700 border-sky-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  done: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
};

/** API-хелперы: POST/PATCH/DELETE с JSON */
export async function apiSend(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = typeof data.detail === 'string' ? data.detail : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return method === 'DELETE' ? null : res.json();
}

/** Текущее имя пользователя: из auth-профиля портала либо из localStorage (для совместимости) */
export function getUserName() {
  const raw = localStorage.getItem('portalAuth');
  if (raw) {
    try {
      const u = JSON.parse(raw)?.user;
      return u?.full_name || u?.username || '';
    } catch { /* noop */ }
  }
  return localStorage.getItem('userName') || '';
}

export function setUserName(name) {
  if (name && name.trim()) localStorage.setItem('userName', name.trim());
}
