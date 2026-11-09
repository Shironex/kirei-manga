import { useCallback, useEffect, useState } from 'react';

import { isTauri } from '@/lib/ipc';
import {
  cancelSignIn,
  getAccount,
  getQueue,
  onTrackingChanged,
  retryQueue,
  signIn,
  signOut,
  type AccountStatus,
  type QueueSummary,
} from '@/lib/tracking';

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The AniList account and the update queue, kept fresh by the
 * `tracking:changed` event. Outside Tauri it stays empty.
 */
export function useAccount() {
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [queue, setQueue] = useState<QueueSummary | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const [nextAccount, nextQueue] = await Promise.all([getAccount(), getQueue()]);
      setAccount(nextAccount);
      setQueue(nextQueue);
    } catch (e) {
      setError(reason(e));
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    void refresh();
    let unlisten: (() => void) | undefined;
    let live = true;
    void onTrackingChanged(() => void refresh()).then(stop => {
      if (live) unlisten = stop;
      else stop();
    });
    return () => {
      live = false;
      unlisten?.();
    };
  }, [refresh]);

  const connect = useCallback(async () => {
    setError(null);
    setWaiting(true);
    try {
      setAccount(await signIn());
    } catch (e) {
      setError(reason(e));
    } finally {
      setWaiting(false);
      void refresh();
    }
  }, [refresh]);

  const cancel = useCallback(() => {
    void cancelSignIn();
  }, []);

  const disconnect = useCallback(async () => {
    setError(null);
    try {
      setAccount(await signOut());
    } catch (e) {
      setError(reason(e));
    }
  }, []);

  const retry = useCallback(async () => {
    setError(null);
    try {
      setQueue(await retryQueue());
    } catch (e) {
      setError(reason(e));
    }
  }, []);

  return { account, queue, waiting, error, connect, cancel, disconnect, retry };
}
