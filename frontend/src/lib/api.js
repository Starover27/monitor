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
 * Цвета для статусов (Tailwind classes)
 */
export const statusColors = {
  up: 'text-cyber-up',
  down: 'text-cyber-down',
  slow: 'text-cyber-slow',
  unknown: 'text-gray-500',
};

export const statusBgColors = {
  up: 'bg-cyber-up/10 border-cyber-up',
  down: 'bg-cyber-down/10 border-cyber-down',
  slow: 'bg-cyber-slow/10 border-cyber-slow',
  unknown: 'bg-gray-800/10 border-gray-600',
};

export const statusGlows = {
  up: 'glow-up',
  down: 'glow-down',
  slow: 'glow-slow',
  unknown: '',
};

/**
 * Форматирует ISO timestamp в относительное время ("5s ago", "2m ago")
 */
export function formatRelativeTime(isoString) {
  if (!isoString) return 'never';
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diff = Math.max(0, now - then);

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

/**
 * Форматирует латентность
 */
export function formatLatency(ms) {
  if (ms == null) return 'N/A';
  return `${ms}ms`;
}
