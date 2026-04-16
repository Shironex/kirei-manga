import { create } from 'zustand';
import {
  createLogger,
  LibraryEvents,
  type LibraryFollowPayload,
  type LibraryFollowResponse,
  type LibraryGetAllResponse,
  type LibraryUnfollowPayload,
  type LibraryUnfollowResponse,
  type LibraryUpdatedEvent,
  type LibraryUpdatesAvailableEvent,
  type Series,
} from '@kireimanga/shared';
import { emitWithResponse, getSocket } from '@/lib/socket';

const logger = createLogger('LibraryStore');

interface LibraryState {
  /** All library entries, mirrored from the desktop gateway. */
  series: Series[];
  /** Map of `mangadexId` → local series `id` (or `pending:<mangadexId>`). */
  mangadexIndex: Record<string, string>;
  loading: boolean;
  error: string | null;
}

interface LibraryActions {
  refresh: () => Promise<void>;
  follow: (mangadexId: string) => Promise<void>;
  unfollow: (mangadexId: string) => Promise<void>;
  initListeners: () => void;
  cleanupListeners: () => void;
}

type LibraryStore = LibraryState & LibraryActions;

// Module-level handler refs so they can be removed on cleanup.
let updatedHandler: ((payload: LibraryUpdatedEvent) => void) | null = null;
let updatesAvailableHandler: ((payload: LibraryUpdatesAvailableEvent) => void) | null = null;
let listenersInitialized = false;

// Coalesce progress-changed broadcasts that don't carry a full series payload
// into a single refresh so the Library list's Continue link + lastReadAt stay
// fresh without fan-out refetches on every page turn.
const PROGRESS_REFRESH_DEBOUNCE_MS = 500;
let progressRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function buildIndex(series: Series[]): Record<string, string> {
  const index: Record<string, string> = {};
  for (const entry of series) {
    if (entry.mangadexId) {
      index[entry.mangadexId] = entry.id;
    }
  }
  return index;
}

function pendingId(mangadexId: string): string {
  return `pending:${mangadexId}`;
}

export const useLibraryStore = create<LibraryStore>()((set, get) => ({
  series: [],
  mangadexIndex: {},
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const response = await emitWithResponse<Record<string, never>, LibraryGetAllResponse>(
        LibraryEvents.GET_ALL,
        {}
      );
      if (response.error) {
        logger.error('library:get-all returned error', response.error);
        set({ loading: false, error: response.error });
        return;
      }
      const entries = response.entries ?? [];
      set({
        series: entries,
        mangadexIndex: buildIndex(entries),
        loading: false,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('library:get-all failed', message);
      set({ loading: false, error: message });
    }
  },

  follow: async (mangadexId: string) => {
    const { mangadexIndex } = get();
    // Idempotent — already followed or in-flight.
    if (mangadexIndex[mangadexId]) return;

    const synthetic: Series = {
      id: pendingId(mangadexId),
      mangadexId,
      source: 'mangadex',
      title: '',
      status: 'reading',
      addedAt: new Date(),
    };

    // Optimistic insert.
    set(state => ({
      series: [...state.series, synthetic],
      mangadexIndex: { ...state.mangadexIndex, [mangadexId]: synthetic.id },
      error: null,
    }));

    try {
      const response = await emitWithResponse<LibraryFollowPayload, LibraryFollowResponse>(
        LibraryEvents.FOLLOW,
        { mangadexId }
      );
      if (response.error || !response.series) {
        throw new Error(response.error ?? 'library:follow returned no series');
      }
      const real = response.series;
      // Replace synthetic with real row.
      set(state => ({
        series: state.series.map(s => (s.id === synthetic.id ? real : s)),
        mangadexIndex: { ...state.mangadexIndex, [mangadexId]: real.id },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('follow failed', message);
      // Rollback: remove synthetic, clear index entry if it still points at it.
      set(state => {
        const nextIndex = { ...state.mangadexIndex };
        if (nextIndex[mangadexId] === synthetic.id) delete nextIndex[mangadexId];
        return {
          series: state.series.filter(s => s.id !== synthetic.id),
          mangadexIndex: nextIndex,
          error: message,
        };
      });
      throw err instanceof Error ? err : new Error(message);
    }
  },

  unfollow: async (mangadexId: string) => {
    const { series, mangadexIndex } = get();
    const localId = mangadexIndex[mangadexId];
    if (!localId) return;

    const snapshotEntry = series.find(s => s.id === localId);
    if (!snapshotEntry) return;

    // Optimistic remove.
    set(state => {
      const nextIndex = { ...state.mangadexIndex };
      delete nextIndex[mangadexId];
      return {
        series: state.series.filter(s => s.id !== localId),
        mangadexIndex: nextIndex,
        error: null,
      };
    });

    // Pending (synthetic) row never reached the server — nothing to emit.
    if (localId.startsWith('pending:')) {
      return;
    }

    try {
      const response = await emitWithResponse<LibraryUnfollowPayload, LibraryUnfollowResponse>(
        LibraryEvents.UNFOLLOW,
        { id: localId }
      );
      if (response.error || !response.success) {
        throw new Error(response.error ?? 'library:unfollow returned success=false');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('unfollow failed', message);
      // Rollback: restore entry and index.
      set(state => ({
        series: [...state.series, snapshotEntry],
        mangadexIndex: snapshotEntry.mangadexId
          ? { ...state.mangadexIndex, [snapshotEntry.mangadexId]: snapshotEntry.id }
          : state.mangadexIndex,
        error: message,
      }));
      throw err instanceof Error ? err : new Error(message);
    }
  },

  initListeners: () => {
    if (listenersInitialized) return;

    updatedHandler = (payload: LibraryUpdatedEvent) => {
      const state = get();
      switch (payload.action) {
        case 'followed': {
          if (!payload.series) return;
          const incoming = payload.series;
          const existingIdx = incoming.mangadexId
            ? state.series.findIndex(s => s.mangadexId === incoming.mangadexId)
            : -1;
          if (existingIdx >= 0) {
            // Replace (covers our own synthetic row as well as stale entries).
            const nextSeries = state.series.slice();
            nextSeries[existingIdx] = incoming;
            set({
              series: nextSeries,
              mangadexIndex: incoming.mangadexId
                ? { ...state.mangadexIndex, [incoming.mangadexId]: incoming.id }
                : state.mangadexIndex,
            });
          } else {
            set({
              series: [...state.series, incoming],
              mangadexIndex: incoming.mangadexId
                ? { ...state.mangadexIndex, [incoming.mangadexId]: incoming.id }
                : state.mangadexIndex,
            });
          }
          return;
        }
        case 'unfollowed': {
          if (!payload.id) return;
          const removed = state.series.find(s => s.id === payload.id);
          if (!removed) return;
          const nextIndex = { ...state.mangadexIndex };
          if (removed.mangadexId && nextIndex[removed.mangadexId] === removed.id) {
            delete nextIndex[removed.mangadexId];
          }
          set({
            series: state.series.filter(s => s.id !== payload.id),
            mangadexIndex: nextIndex,
          });
          return;
        }
        case 'status-changed': {
          if (!payload.series) return;
          const incoming = payload.series;
          set({
            series: state.series.map(s => (s.id === incoming.id ? incoming : s)),
          });
          return;
        }
        case 'progress-changed': {
          // The backend may include the updated series row; if so, swap it in.
          if (payload.series) {
            const incoming = payload.series;
            set({
              series: state.series.map(s => (s.id === incoming.id ? incoming : s)),
              mangadexIndex: incoming.mangadexId
                ? { ...state.mangadexIndex, [incoming.mangadexId]: incoming.id }
                : state.mangadexIndex,
            });
            return;
          }
          // No series payload — debounce a full refresh so the Library list's
          // Continue link + lastReadAt stay in sync without thrashing.
          if (progressRefreshTimer) clearTimeout(progressRefreshTimer);
          progressRefreshTimer = setTimeout(() => {
            progressRefreshTimer = null;
            void get().refresh();
          }, PROGRESS_REFRESH_DEBOUNCE_MS);
          return;
        }
        default:
          return;
      }
    };

    getSocket().on(LibraryEvents.UPDATED, updatedHandler);

    updatesAvailableHandler = (payload: LibraryUpdatesAvailableEvent) => {
      const state = get();
      if (!payload.results || payload.results.length === 0) return;
      const countBySeriesId = new Map(
        payload.results.map(r => [r.seriesId, r.newCount])
      );
      set({
        series: state.series.map(s =>
          countBySeriesId.has(s.id)
            ? { ...s, newChapterCount: countBySeriesId.get(s.id) }
            : s
        ),
      });
    };
    getSocket().on(LibraryEvents.UPDATES_AVAILABLE, updatesAvailableHandler);

    listenersInitialized = true;
    logger.debug('Library listeners registered');
  },

  cleanupListeners: () => {
    if (updatedHandler) {
      getSocket().off(LibraryEvents.UPDATED, updatedHandler);
      updatedHandler = null;
    }
    if (updatesAvailableHandler) {
      getSocket().off(LibraryEvents.UPDATES_AVAILABLE, updatesAvailableHandler);
      updatesAvailableHandler = null;
    }
    listenersInitialized = false;
    logger.debug('Library listeners cleaned up');
  },
}));
