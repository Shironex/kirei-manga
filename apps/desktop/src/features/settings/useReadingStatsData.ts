import { useCallback, useEffect, useRef, useState } from 'react';

import { isTauri } from '@/lib/ipc';
import { clearReadingStats, countReadingSessions } from '@/lib/stats';

import { describeClearedSessions } from './format';

/**
 * The Reading stats row of the Data section: how many sessions are stored
 * and clearing them. Outside Tauri it stays empty and idle.
 */
export function useReadingStatsData() {
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const next = await countReadingSessions();
      if (mounted.current) setCount(next);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const clear = useCallback(async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const cleared = await clearReadingStats();
      if (mounted.current) setNotice(describeClearedSessions(cleared));
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setBusy(false);
      await refresh();
    }
  }, [refresh]);

  return { available: isTauri(), count, busy, error, notice, clear };
}
