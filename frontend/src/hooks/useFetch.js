/**
 * useFetch — кастомный хук для работы с API с поддержкой автообновления.
 * Возвращает lastUpdated (метка времени последнего успешного запроса),
 * чтобы UI мог показывать «обновлено N сек назад».
 */
import { useState, useEffect, useCallback, useRef } from 'react';

export function useFetch(url, { interval = 10000, immediate = true, headers } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [lastUpdated, setLastUpdated] = useState(null);
  const abortRef = useRef(null);
  const headersRef = useRef(headers);
  headersRef.current = headers;

  const fetchData = useCallback(async () => {
    if (!url) return;

    // Отменяем предыдущий запрос, если он ещё в процессе
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(url, { signal: controller.signal, headers: headersRef.current });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const json = await res.json();
      setData(json);
      setError(null);
      setLastUpdated(Date.now());
    } catch (e) {
      if (e.name === 'AbortError') return; // Игнорируем отмену
      setError(e.message);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [url]);

  useEffect(() => {
    setLoading(immediate);
    if (immediate) {
      fetchData();
    }

    if (!interval) return undefined;

    const intervalId = setInterval(fetchData, interval);

    return () => {
      clearInterval(intervalId);
      abortRef.current?.abort();
    };
  }, [fetchData, interval, immediate]);

  return { data, error, loading, lastUpdated, refetch: fetchData };
}
