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
   * `kirei-page://...` proxy URL of the page being shown — what the renderer
   * actually has on hand. The desktop's pipeline orchestrator resolves this
   * to a real on-disk file via `PageUrlResolverService`, then hashes it for
   * the cache key, so a stable URL across renders maps to the same cache
   * row.
   *
   * `null` (e.g. before pages have loaded) leaves the hook in `idle` and
   * never fires.
   */
  pageUrl: string | null;
  /**
   * Already-resolved filesystem path. Mutually exclusive with `pageUrl` —
   * present so legacy callers / tests that already hold the path can skip
   * server-side resolution. Exactly one of the two must be non-null for
   * the hook to fire.
   */
  pageImagePath?: string | null;
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
 * and waits for `runNow()`. A new page key (URL or path) resets the state
 * and, if auto-translate is on, fires the pipeline again.
 */
export function useTranslationForPage(
  args: UseTranslationForPageArgs
): UseTranslationForPageState {
  const {
    pageUrl,
    pageImagePath = null,
    targetLang: targetLangOverride,
    providerHint: providerHintOverride,
  } = args;

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

  // The "page key" — what we treat as the unit identity of a page. URL wins
  // over path so the renderer's normal flow (kirei-page://...) drives the
  // hook; tests / legacy callers that pass a real path still work.
  const pageKey = pageUrl ?? pageImagePath ?? null;

  // Refs let `runNow` stay stable while still observing the latest settings —
  // a manual click should always use the user's current target lang / provider
  // even if the component memoized the callback earlier.
  const targetLangRef = useRef(targetLang);
  const providerHintRef = useRef(providerHint);
  const pageUrlRef = useRef(pageUrl);
  const pageImagePathRef = useRef(pageImagePath);
  const socketStatusRef = useRef(socketStatus);

  useEffect(() => {
    targetLangRef.current = targetLang;
    providerHintRef.current = providerHint;
    pageUrlRef.current = pageUrl;
    pageImagePathRef.current = pageImagePath;
    socketStatusRef.current = socketStatus;
  });

  const runNow = useCallback(async (): Promise<void> => {
    const url = pageUrlRef.current;
    const path = pageImagePathRef.current;
    if (!url && !path) return;

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
      // URL wins — the renderer never resolves to disk. Path is a fallback
      // for tests and legacy callers; the orchestrator's gateway enforces
      // exactly-one.
      const payload: TranslationRunPipelinePayload = {
        ...(url ? { pageUrl: url } : { pageImagePath: path as string }),
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

    if (!pageKey) {
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
  }, [pageKey, enabled, autoTranslate, runNow]);

  return { page, status, error, runNow };
}
