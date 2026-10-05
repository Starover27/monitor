/**
 * API helpers и утилиты
 */

// Базовый URL API (по умолчанию для прокси Vite)
export const API_BASE = import.meta.env.VITE_API_URL || '';

// Порог "медленного" ответа в миллисекундах
export const SLOW_THRESHOLD_MS = 500;

// URL эндпоинтов
export const servicesUrl = () => `${API_BASE}/api/services`;
export const groupsUrl = () => `${API_BASE}/api/groups`;
export const alertsUrl = (limit = 100) => `${API_BASE}/api/alerts?limit=${limit}`;

export async function saveGroup(method, name, newName) {
  const res = await fetch(`${groupsUrl()}${method === 'POST' ? '' : `?name=${encodeURIComponent(name)}`}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(method !== 'DELETE' ? { body: JSON.stringify({ name: newName || name }) } : {}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === 'string' ? body.detail : `Ошибка сохранения: HTTP ${res.status}`);
  }
}
export const historyUrl = (serviceId, hours = 24) =>
  `${API_BASE}/api/history/${serviceId}?hours=${hours}`;

/**
 * Обновляет сервис (PATCH /api/services/{id}).
 * Используется для группировки drag-and-drop.
 */
export async function patchService(serviceId, fields) {
  try {
    const res = await fetch(`${API_BASE}/api/services/${serviceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('patchService error:', e);
    throw e;
  }
}

/**
 * Массовое обновление группировки (POST /api/services/grouping).
 * updates: [{ id, group_name, sort_order }, ...]
 */
export async function updateGrouping(updates) {
  try {
    const res = await fetch(`${API_BASE}/api/services/grouping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('updateGrouping error:', e);
    return null;
  }
}

/**
 * Форматирует значение метрики с единицей измерения.
 * Возвращает null если метрики нет.
 */
export function formatMetric(value, unit) {
  if (value == null) return null;
  return `${value}${unit ? ' ' + unit : ''}`;
}

/**
 * Типы проверок, которые являются системными метриками
 */
export const METRIC_CHECK_TYPES = ['disk', 'cpu', 'memory', 'network'];

export function isMetricType(checkType) {
  return METRIC_CHECK_TYPES.includes(checkType);
}

/**
 * Вычисляет эффективный статус сервиса с учётом латентности.
 * Backend хранит только up/down/unknown, но мы добавляем "slow" (degraded)
 * если сервис отвечает, но медленно (> SLOW_THRESHOLD_MS).
 */
export function effectiveStatus(service) {
  if (!service.current_status) return 'unknown';
  if (service.current_status === 'down') return 'down';
  if (service.current_status === 'unknown') return 'unknown';
  // Если up, но latency высокая — считаем degraded (slow)
  if (service.current_status === 'up') {
    if (service.last_latency_ms && service.last_latency_ms > SLOW_THRESHOLD_MS) {
      return 'slow';
    }
    return 'up';
  }
  return 'unknown';
}

/**
 * Русские подписи статусов
 */
export const STATUS_LABELS = {
  up: 'Работает',
  down: 'Недоступен',
  slow: 'Медленно',
  unknown: 'Нет данных',
};

/**
 * Готовые (статические) наборы Tailwind-классов для статусов.
 * ВАЖНО: классы должны быть прописаны литералами, иначе Tailwind JIT
 * их не найдёт и не сгенерирует.
 */
export const statusStyles = {
  up: {
    dot: 'bg-emerald-400',
    text: 'text-emerald-300',
    border: 'border-emerald-500/40',
    bgSoft: 'bg-emerald-500/10',
    glow: 'glow-up',
  },
  down: {
    dot: 'bg-rose-400',
    text: 'text-rose-300',
    border: 'border-rose-500/40',
    bgSoft: 'bg-rose-500/10',
    glow: 'glow-down',
  },
  slow: {
    dot: 'bg-amber-400',
    text: 'text-amber-300',
    border: 'border-amber-500/40',
    bgSoft: 'bg-amber-500/10',
    glow: 'glow-slow',
  },
  unknown: {
    dot: 'bg-slate-500',
    text: 'text-slate-400',
    border: 'border-slate-600/60',
    bgSoft: 'bg-slate-500/10',
    glow: '',
  },
};

/**
 * Форматирует ISO timestamp в относительное время ("5 сек назад", "2 мин назад")
 */
export function formatRelativeTime(isoString) {
  if (!isoString) return 'никогда';
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diff = Math.max(0, now - then);

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const plural = (n, forms) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
    return forms[2];
  };

  if (days > 0) return `${days} ${plural(days, ['день', 'дня', 'дней'])} назад`;
  if (hours > 0) return `${hours} ${plural(hours, ['час', 'часа', 'часов'])} назад`;
  if (minutes > 0) return `${minutes} ${plural(minutes, ['минуту', 'минуты', 'минут'])} назад`;
  return `${seconds} ${plural(seconds, ['секунду', 'секунды', 'секунд'])} назад`;
}

/**
 * Форматирует латентность
 */
export function formatLatency(ms) {
  if (ms == null) return '—';
  return `${ms} мс`;
}

/**
 * Форматирует байты в человекочитаемый вид
 */
export function formatBytes(n) {
  if (!Number.isFinite(n)) return '—';
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Форматирует дату-время для ru-RU
 */
export function formatDateTime(v, withTime = true) {
  if (!v) return '—';
  return new Date(v).toLocaleString('ru-RU', withTime ? {} : { day: '2-digit', month: '2-digit', year: 'numeric' });
}
