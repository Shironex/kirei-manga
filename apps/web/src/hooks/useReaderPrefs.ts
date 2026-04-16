import { useCallback, useEffect, useRef } from 'react';
import {
  ReaderEvents,
  type FitMode,
  type ReaderDirection,
  type ReaderGetPrefsPayload,
  type ReaderGetPrefsResponse,
  type ReaderMode,
  type ReaderSetPrefsPayload,
  type ReaderSetPrefsResponse,
  type ReaderSettings,
} from '@kireimanga/shared';
import { emitWithResponse } from '@/lib/socket';
import { useReaderStore } from '@/stores/reader-store';
import { useSocketStore } from '@/stores/socket-store';
import { useToastStore } from '@/stores/toast-store';

const PERSIST_DEBOUNCE_MS = 500;

interface ReaderPrefsHook {
  setPrefs: (partial: Partial<ReaderSettings>) => void;
}

/**
 * Hydrates the reader store from the desktop's persisted per-series prefs on
 * mount, and exposes a debounced `setPrefs` that updates the store
 * optimistically while persisting to disk via `reader:set-prefs`. Persistence
 * failures surface as toasts; the store stays optimistic.
 */
export function useReaderPrefs(seriesId: string | undefined): ReaderPrefsHook {
  const status = useSocketStore(s => s.status);
  const setMode = useReaderStore(s => s.setMode);
  const setDirection = useReaderStore(s => s.setDirection);
  const setFit = useReaderStore(s => s.setFit);
  const showToast = useToastStore(s => s.show);

  // Coalesce rapid pref changes into a single debounced emit per (series).
  const pendingRef = useRef<Partial<ReaderSettings>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seriesIdRef = useRef<string | undefined>(seriesId);
  seriesIdRef.current = seriesId;

  const flush = useCallback(async () => {
    timerRef.current = null;
    const series = seriesIdRef.current;
    const payloadPrefs = pendingRef.current;
    pendingRef.current = {};
    if (!series || Object.keys(payloadPrefs).length === 0) return;
    try {
      const payload: ReaderSetPrefsPayload = { seriesId: series, prefs: payloadPrefs };
      const res = await emitWithResponse<ReaderSetPrefsPayload, ReaderSetPrefsResponse>(
        ReaderEvents.SET_PREFS,
        payload
      );
      if (res.error) {
        showToast({
          variant: 'error',
          title: 'Reader preferences',
          body: res.error,
        });
      }
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Reader preferences',
        body: err instanceof Error ? err.message : String(err),
      });
    }
  }, [showToast]);

  // Hydrate from disk whenever the series changes (and the socket is up).
  useEffect(() => {
    if (!seriesId) return;
    if (status !== 'connected') return;
    let cancelled = false;
    (async () => {
      try {
        const payload: ReaderGetPrefsPayload = { seriesId };
        const res = await emitWithResponse<ReaderGetPrefsPayload, ReaderGetPrefsResponse>(
          ReaderEvents.GET_PREFS,
          payload
        );
        if (cancelled) return;
        if (res.error) {
          showToast({
            variant: 'error',
            title: 'Reader preferences',
            body: res.error,
          });
          return;
        }
        setMode(res.prefs.mode);
        setDirection(res.prefs.direction);
        setFit(res.prefs.fit);
      } catch (err) {
        if (cancelled) return;
        showToast({
          variant: 'error',
          title: 'Reader preferences',
          body: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seriesId, status, setMode, setDirection, setFit, showToast]);

  // Flush pending writes on unmount so quick exits don't drop the last change.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        void flush();
      }
    };
  }, [flush]);

  const setPrefs = useCallback(
    (partial: Partial<ReaderSettings>) => {
      // Optimistic update.
      if (partial.mode !== undefined) setMode(partial.mode as ReaderMode);
      if (partial.direction !== undefined) setDirection(partial.direction as ReaderDirection);
      if (partial.fit !== undefined) setFit(partial.fit as FitMode);

      // Merge into pending payload and reset the debounce timer.
      pendingRef.current = { ...pendingRef.current, ...partial };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flush();
      }, PERSIST_DEBOUNCE_MS);
    },
    [setMode, setDirection, setFit, flush]
  );

  return { setPrefs };
}
