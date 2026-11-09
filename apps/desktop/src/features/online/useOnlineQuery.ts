import { useCallback, useEffect, useRef, useState } from 'react';

import { toOnlineError, type OnlineError } from '@/lib/online';

export type QueryState<T> =
  | { status: 'loading'; data: T | null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: T | null; error: OnlineError };

/**
 * Runs an online command when `key` changes and keeps the last data while a
 * reload runs, so a refresh never blanks the screen. A result that arrives
 * after the key moved on is dropped.
 */
export function useOnlineQuery<T>(
  key: string | null,
  load: () => Promise<T>
): QueryState<T> & { reload: () => void; set: (data: T) => void } {
  const [state, setState] = useState<QueryState<T>>({
    status: 'loading',
    data: null,
    error: null,
  });
  const [round, setRound] = useState(0);
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });

  useEffect(() => {
    if (key === null) return;
    let alive = true;
    setState(current => ({ status: 'loading', data: current.data, error: null }));
    loader.current().then(
      data => alive && setState({ status: 'ready', data, error: null }),
      (error: unknown) =>
        alive &&
        setState(current => ({ status: 'error', data: current.data, error: toOnlineError(error) }))
    );
    return () => {
      alive = false;
    };
  }, [key, round]);

  const reload = useCallback(() => setRound(n => n + 1), []);
  const set = useCallback((data: T) => setState({ status: 'ready', data, error: null }), []);
  return { ...state, reload, set };
}
