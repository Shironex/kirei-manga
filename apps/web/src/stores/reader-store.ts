import { create } from 'zustand';
import {
  createLogger,
  DEFAULT_READER_SETTINGS,
  type FitMode,
  type ReaderDirection,
  type ReaderMode,
} from '@kireimanga/shared';

const logger = createLogger('ReaderStore');

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;

interface ReaderState {
  chapterId: string | null;
  seriesId: string | null;
  totalPages: number;
  /** Current page (0-indexed). In `double` mode this is the spread's primary page. */
  pageIndex: number;
  mode: ReaderMode;
  direction: ReaderDirection;
  fit: FitMode;
  chromeVisible: boolean;
  /** Single-page only. 1 = fit, clamp [0.5, 4]. */
  zoom: number;
}

interface ReaderActions {
  reset(args: { chapterId: string; seriesId: string }): void;
  setTotalPages(n: number): void;
  setMode(mode: ReaderMode): void;
  setDirection(direction: ReaderDirection): void;
  setFit(fit: FitMode): void;
  next(): void;
  prev(): void;
  goto(n: number): void;
  first(): void;
  last(): void;
  setZoom(z: number): void;
  showChrome(): void;
  hideChrome(): void;
}

type ReaderStore = ReaderState & ReaderActions;

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(Math.max(n, min), max);
}

/** Snap an arbitrary page index to the primary page of its spread (double mode). */
function spreadPrimary(i: number): number {
  if (i <= 0) return 0;
  return i % 2 === 1 ? i : i - 1;
}

export const useReaderStore = create<ReaderStore>()((set, get) => ({
  chapterId: null,
  seriesId: null,
  totalPages: 0,
  pageIndex: 0,
  mode: DEFAULT_READER_SETTINGS.mode,
  direction: DEFAULT_READER_SETTINGS.direction,
  fit: DEFAULT_READER_SETTINGS.fit,
  chromeVisible: true,
  zoom: 1,

  reset: ({ chapterId, seriesId }) => {
    logger.debug('reset', { chapterId, seriesId });
    set({
      chapterId,
      seriesId,
      totalPages: 0,
      pageIndex: 0,
      zoom: 1,
      chromeVisible: true,
    });
  },

  setTotalPages: n => set({ totalPages: Math.max(0, n) }),

  setMode: mode => {
    const { pageIndex } = get();
    set({
      mode,
      pageIndex: mode === 'double' ? spreadPrimary(pageIndex) : pageIndex,
    });
  },

  setDirection: direction => set({ direction }),

  setFit: fit => set({ fit, zoom: 1 }),

  next: () => {
    const { mode, pageIndex, totalPages } = get();
    if (totalPages === 0) return;
    const last = totalPages - 1;
    if (mode === 'double') {
      // Cover (0) is alone, then pairs (1,2), (3,4), ...
      const nextIndex = pageIndex <= 0 ? 1 : pageIndex + 2;
      set({ pageIndex: clamp(nextIndex, 0, last) });
      return;
    }
    set({ pageIndex: clamp(pageIndex + 1, 0, last) });
  },

  prev: () => {
    const { mode, pageIndex } = get();
    if (mode === 'double') {
      const prevIndex = pageIndex <= 1 ? 0 : pageIndex - 2;
      set({ pageIndex: clamp(prevIndex, 0, Number.MAX_SAFE_INTEGER) });
      return;
    }
    set({ pageIndex: Math.max(0, pageIndex - 1) });
  },

  goto: n => {
    const { totalPages, mode } = get();
    if (totalPages === 0) return;
    const last = totalPages - 1;
    const target = clamp(Math.floor(n), 0, last);
    set({ pageIndex: mode === 'double' ? spreadPrimary(target) : target });
  },

  first: () => set({ pageIndex: 0 }),

  last: () => {
    const { totalPages, mode } = get();
    if (totalPages === 0) return;
    const last = totalPages - 1;
    set({ pageIndex: mode === 'double' ? spreadPrimary(last) : last });
  },

  setZoom: z => set({ zoom: clamp(z, ZOOM_MIN, ZOOM_MAX) }),

  showChrome: () => set({ chromeVisible: true }),
  hideChrome: () => set({ chromeVisible: false }),
}));

export const READER_ZOOM_MIN = ZOOM_MIN;
export const READER_ZOOM_MAX = ZOOM_MAX;
