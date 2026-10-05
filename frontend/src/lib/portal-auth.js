/**
 * Аутентификация портала: токен + профиль в localStorage
 */
import { API_BASE } from './api';

const KEY = 'portalAuth';

export function getAuth() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuth(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function clearAuth() {
  localStorage.removeItem(KEY);
  localStorage.removeItem('userName');
}

export async function loginRequest(username, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Не удалось войти');
  }
  return data; // { token, user }
}

/** fetch с Bearer-токеном портала */
export async function authFetch(url, options = {}) {
  const auth = getAuth();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    clearAuth();
    window.location.href = '/';
    throw new Error('Сессия истекла, войдите заново');
  }
  return res;
}

/** apiSend поверх authFetch */
export async function authSend(url, method, body) {
  const res = await authFetch(url, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = typeof data.detail === 'string' ? data.detail : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return method === 'DELETE' ? null : res.json();
}
