import { create } from 'zustand';
import {
  createLogger,
  LibraryEvents,
  MangaDexEvents,
  type LibraryUpdatedEvent,
  type MangaDexDownloadChapterPayload,
  type MangaDexDownloadProgressEvent,
} from '@kireimanga/shared';
import { emitWithResponse, getSocket } from '@/lib/socket';

const logger = createLogger('DownloadsStore');

export type DownloadStatus = 'downloading' | 'complete' | 'error';

export interface DownloadEntry {
  status: DownloadStatus;
  current: number;
  total: number;
  error: string | null;
}

interface DownloadsState {
  /**
   * Per-chapter download state. Keyed by MangaDex chapterId. Persists across
   * component remounts so navigating away and back doesn't lose the "in-flight"
   * status, which is the bug a local `useState` in `useDownloadChapter` had.
   */
  entries: Record<string, DownloadEntry>;
}

interface DownloadsActions {
  /**
   * Optimistically mark a chapter as queued/downloading and fire the IPC to
   * the backend. The backend dedupes by chapterId (`downloadQueue.has`), so
   * a second call for the same chapter is a no-op on the server — but we
   * still set local state defensively so the UI renders the spinner.
   *
   * No-op if the chapter is already downloading or complete in the store.
   */
  requestDownload: (chapterId: string, mangadexSeriesId: string) => void;
  /** Drop an entry from the store (used after manual dismiss / series unfollow). */
  clear: (chapterId: string) => void;
  /** Subscribe to the global progress broadcast. Call once at app bootstrap. */
  initListeners: () => void;
  cleanupListeners: () => void;
}

type DownloadsStore = DownloadsState & DownloadsActions;

let progressHandler: ((event: MangaDexDownloadProgressEvent) => void) | null = null;
let libraryUpdatedHandler: ((event: LibraryUpdatedEvent) => void) | null = null;
let listenersInitialized = false;

export const useDownloadsStore = create<DownloadsStore>()((set, get) => ({
  entries: {},

  requestDownload: (chapterId, mangadexSeriesId) => {
    const existing = get().entries[chapterId];
    if (existing && (existing.status === 'downloading' || existing.status === 'complete')) {
      return;
    }

    set(state => ({
      entries: {
        ...state.entries,
        [chapterId]: { status: 'downloading', current: 0, total: 0, error: null },
      },
    }));

    void emitWithResponse<MangaDexDownloadChapterPayload, { success: boolean; error?: string }>(
      MangaDexEvents.DOWNLOAD_CHAPTER,
      { chapterId, mangadexSeriesId }
    ).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`download request failed for ${chapterId}: ${message}`);
      set(state => ({
        entries: {
          ...state.entries,
          [chapterId]: {
            status: 'error',
            current: 0,
            total: 0,
            error: message,
          },
        },
      }));
    });
  },

  clear: chapterId => {
    set(state => {
      if (!(chapterId in state.entries)) return state;
      const next = { ...state.entries };
      delete next[chapterId];
      return { entries: next };
    });
  },

  initListeners: () => {
    if (listenersInitialized) return;
    progressHandler = (event: MangaDexDownloadProgressEvent) => {
      set(state => ({
        entries: {
          ...state.entries,
          [event.chapterId]: {
            status: event.status,
            current: event.current,
            total: event.total,
            error: event.status === 'error' ? (event.error ?? 'Download failed') : null,
          },
        },
      }));
    };
    // When the page cache is wiped, any `complete` entries we remember are
    // now stale — drop them so the UI falls back to the (fresh) DB flag.
    // In-flight entries (`downloading`) are kept: their bytes are being
    // re-written into the new empty folder, so the spinner remains valid.
    libraryUpdatedHandler = (event: LibraryUpdatedEvent) => {
      if (event.action !== 'downloads-cleared') return;
      set(state => {
        const next: Record<string, DownloadEntry> = {};
        for (const [id, entry] of Object.entries(state.entries)) {
          if (entry.status !== 'complete') next[id] = entry;
        }
        return { entries: next };
      });
    };
    getSocket().on(MangaDexEvents.DOWNLOAD_PROGRESS, progressHandler);
    getSocket().on(LibraryEvents.UPDATED, libraryUpdatedHandler);
    listenersInitialized = true;
    logger.debug('Download progress listener registered');
  },

  cleanupListeners: () => {
    if (progressHandler) {
      getSocket().off(MangaDexEvents.DOWNLOAD_PROGRESS, progressHandler);
      progressHandler = null;
    }
    if (libraryUpdatedHandler) {
      getSocket().off(LibraryEvents.UPDATED, libraryUpdatedHandler);
      libraryUpdatedHandler = null;
    }
    listenersInitialized = false;
  },
}));
