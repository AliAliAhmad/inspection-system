import { useEffect, useState } from 'react';

/**
 * The value, once it has stopped changing for `delay` ms.
 *
 * For search boxes: without it a list refetches on EVERY keystroke — "hassan"
 * is six requests in a second. That wasted requests against a rate limit the
 * whole company used to share (see rate_limit_key in app/extensions.py), which
 * is part of how searching produced "Error loading data" (Ali, 2026-09-24).
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
