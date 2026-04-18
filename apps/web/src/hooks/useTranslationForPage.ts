import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TranslationEvents,
  type PageTranslation,
  type TranslationProviderId,
  type TranslationRunPipelinePayload,
  type TranslationRunPipelineResponse,
} from '@kireimanga/shared';
import { emitWithResponse } from '@/lib/socket';
import { useSettingsStore } from '@/stores/settings-store';
import { useSocketStore } from '@/stores/socket-store';

const DISCONNECTED_ERROR = 'Disconnected';

export type TranslationStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseTranslationForPageArgs {
  /**
   * Absolute filesystem path to the page image. The desktop's pipeline
   * orchestrator hashes this file and consults the translation cache before
   * doing any expensive work — so passing the same path twice in a row is a
   * cheap second call.
   *
   * `null` (e.g. while the reader is still resolving the URL → path) leaves
   * the hook in `idle` and never fires.
   */
  pageImagePath: string | null;
  /** Override the user's default `settings.translation.targetLang`. */
  targetLang?: string;
  /** Override the user's default `settings.translation.defaultProvider`. */
  providerHint?: TranslationProviderId;
}

export interface UseTranslationForPageState {
  /** Translated bubbles for the page, or null until the pipeline completes. */
  page: PageTranslation | null;
  /** Lifecycle marker — drives the overlay's loading / error UI. */
  status: TranslationStatus;
  /** Human-readable failure reason; `null` while idle / loading / ready. */
  error: string | null;
  /**
   * Manually trigger the pipeline. Fires regardless of `autoTranslate` —
   * used by the future "Translate" button (Slice G.6 fallback path) when the
   * user opts in for a single page even though auto-translate is off.
   */
  runNow: () => Promise<void>;
}

/**
 * Drives the translation overlay for a single reader page.
 *
 * The hook talks to the desktop via `translation:run-pipeline` only — the
 * pipeline orchestrator (Slice F.3) handles cache lookup internally, so a
 * cached page short-circuits inside the desktop without a separate
 * `translation:get-page` round-trip from the renderer.
 *
 * Auto-fires when `settings.translation.enabled` AND
 * `settings.translation.autoTranslate` are both on; otherwise stays `idle`
 * and waits for `runNow()`. A new `pageImagePath` resets the state and, if
 * auto-translate is on, fires the pipeline again.
 */
export function useTranslationForPage(
  args: UseTranslationForPageArgs
): UseTranslationForPageState {
  const { pageImagePath, targetLang: targetLangOverride, providerHint: providerHintOverride } = args;

  const translationSettings = useSettingsStore(s => s.settings?.translation);
  const socketStatus = useSocketStore(s => s.status);

  const [page, setPage] = useState<PageTranslation | null>(null);
  const [status, setStatus] = useState<TranslationStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const enabled = translationSettings?.enabled ?? false;
  const autoTranslate = translationSettings?.autoTranslate ?? false;
  const settingsTargetLang = translationSettings?.targetLang;
  const settingsDefaultProvider = translationSettings?.defaultProvider;

  const targetLang = targetLangOverride ?? settingsTargetLang ?? 'en';
  const providerHint = providerHintOverride ?? settingsDefaultProvider;

  // Refs let `runNow` stay stable while still observing the latest settings —
  // a manual click should always use the user's current target lang / provider
  // even if the component memoized the callback earlier.
  const targetLangRef = useRef(targetLang);
  const providerHintRef = useRef(providerHint);
  const pageImagePathRef = useRef(pageImagePath);
  const socketStatusRef = useRef(socketStatus);

  useEffect(() => {
    targetLangRef.current = targetLang;
    providerHintRef.current = providerHint;
    pageImagePathRef.current = pageImagePath;
    socketStatusRef.current = socketStatus;
  });

  const runNow = useCallback(async (): Promise<void> => {
    const path = pageImagePathRef.current;
    if (!path) return;

    if (socketStatusRef.current !== 'connected') {
      setStatus('error');
      setError(DISCONNECTED_ERROR);
      setPage(null);
      return;
    }

    const rid = ++requestIdRef.current;
    setStatus('loading');
    setError(null);

    try {
      const payload: TranslationRunPipelinePayload = {
        pageImagePath: path,
        targetLang: targetLangRef.current,
        ...(providerHintRef.current ? { providerHint: providerHintRef.current } : {}),
      };
      const response = await emitWithResponse<
        TranslationRunPipelinePayload,
        TranslationRunPipelineResponse
      >(TranslationEvents.RUN_PIPELINE, payload);

      if (!mountedRef.current || rid !== requestIdRef.current) return;

      if (response.error) {
        setStatus('error');
        setError(response.error);
        setPage(null);
        return;
      }

      setPage(response.page);
      setStatus('ready');
      setError(null);
    } catch (err) {
      if (!mountedRef.current || rid !== requestIdRef.current) return;
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
      setPage(null);
    }
  }, []);

  useEffect(() => {
    // Bump request id so any in-flight pipeline call from a previous page is
    // discarded when its response arrives.
    requestIdRef.current += 1;

    if (!pageImagePath) {
      setPage(null);
      setStatus('idle');
      setError(null);
      return;
    }

    if (!enabled || !autoTranslate) {
      setPage(null);
      setStatus('idle');
      setError(null);
      return;
    }

    setPage(null);
    setStatus('idle');
    setError(null);
    void runNow();
    // `runNow` reads target lang / provider from refs, so re-firing on those
    // changes alone (without a page change) is intentionally skipped — the
    // user can hit the manual button if they switch provider mid-page.
  }, [pageImagePath, enabled, autoTranslate, runNow]);

  return { page, status, error, runNow };
}
