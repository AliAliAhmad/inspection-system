import { useEffect, useState } from 'react';

/**
 * The value, settled: it changes only after `delayMs` of quiet.
 * Keeps a search box from firing one server request per keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return settled;
}
