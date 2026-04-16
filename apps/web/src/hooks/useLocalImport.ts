import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LocalEvents,
  type LocalImportPayload,
  type LocalImportResponse,
  type LocalPickFolderResponse,
  type LocalScanPayload,
  type LocalScanProgressEvent,
  type LocalScanResponse,
  type ScanCandidateSeries,
  type ScanProgress,
  type ScanResult,
  createLogger,
} from '@kireimanga/shared';
import { emitWithResponse, getSocket } from '@/lib/socket';

const logger = createLogger('useLocalImport');

/**
 * Ask the main process to open a native folder picker. Resolves to the
 * absolute path the user chose, or `null` on cancel. Errors bubble up —
 * callers usually surface them through the toast store.
 */
export function useFolderPicker(): { pick: () => Promise<string | null> } {
  const pick = useCallback(async () => {
    const response = await emitWithResponse<Record<string, never>, LocalPickFolderResponse>(
      LocalEvents.PICK_FOLDER,
      {}
    );
    if (response.error) {
      throw new Error(response.error);
    }
    return response.path;
  }, []);
  return { pick };
}

/**
 * Drive a `local:scan` call while subscribing to the streaming progress
 * channel in the background. The hook keeps its own listener on
 * `local:scan-progress` so the progress bar stays live regardless of
 * React rendering cadence; the listener drops off as soon as the scan
 * promise settles, avoiding the "still ticking after navigation" class of
 * bugs.
 */
export function useScanRoot(): {
  progress: ScanProgress | null;
  scan: (rootPath: string) => Promise<ScanResult | null>;
  reset: () => void;
} {
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  // Keep the active-scan flag out of render — the listener only needs a
  // ref, and we want it deterministic across re-renders.
  const activeRef = useRef(false);

  useEffect(() => {
    const handler = (event: LocalScanProgressEvent): void => {
      if (!activeRef.current) return;
      setProgress(event.progress);
    };
    getSocket().on(LocalEvents.SCAN_PROGRESS, handler);
    return () => {
      getSocket().off(LocalEvents.SCAN_PROGRESS, handler);
    };
  }, []);

  const scan = useCallback(async (rootPath: string): Promise<ScanResult | null> => {
    activeRef.current = true;
    setProgress({ phase: 'scanning', current: 0, total: 0, currentPath: rootPath });
    try {
      const response = await emitWithResponse<LocalScanPayload, LocalScanResponse>(
        LocalEvents.SCAN,
        { rootPath },
        60_000
      );
      if (response.error) {
        logger.error('local:scan returned error', response.error);
        throw new Error(response.error);
      }
      return response.result;
    } finally {
      activeRef.current = false;
    }
  }, []);

  const reset = useCallback(() => {
    activeRef.current = false;
    setProgress(null);
  }, []);

  return { progress, scan, reset };
}

/**
 * Commit a user-confirmed scan proposal. Returns the count of newly-created
 * series plus how many were skipped as duplicates. The caller is expected
 * to navigate away from the import page on success — the library store
 * picks up the new rows via the `library:updated` broadcast the gateway
 * fires per created series.
 */
export function useImport(): {
  importing: boolean;
  commit: (rootPath: string, candidates: ScanCandidateSeries[]) => Promise<LocalImportResponse>;
} {
  const [importing, setImporting] = useState(false);

  const commit = useCallback(async (rootPath: string, candidates: ScanCandidateSeries[]) => {
    setImporting(true);
    try {
      const response = await emitWithResponse<LocalImportPayload, LocalImportResponse>(
        LocalEvents.IMPORT,
        { rootPath, candidates },
        120_000
      );
      if (response.error) {
        throw new Error(response.error);
      }
      return response;
    } finally {
      setImporting(false);
    }
  }, []);

  return { importing, commit };
}
