import { useCallback, useEffect, useRef, useState } from 'react';

import {
  closeSource,
  deviceBox,
  focusPage,
  openSource,
  readerStats,
  setViewport,
  stepPage,
  type OpenedSource,
  type ReaderStats,
} from '@/lib/reader';

export interface PageSourceState {
  source: OpenedSource | null;
  index: number;
  error: string | null;
  /** Time from the page change to the image's load event, in ms. */
  lastPageMs: number | null;
  stats: ReaderStats | null;
  /** Render revision from the last viewport hint, for page URLs. */
  revision: number | undefined;
  open: (path: string) => Promise<void>;
  step: (delta: number) => void;
  onPageLoaded: () => void;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The page frame on the test page: at most 56rem wide, 75vh tall. */
const FRAME_MAX_CSS_WIDTH = 896;
const FRAME_HEIGHT_SHARE = 0.75;

/** Owns one opened source: page position, read-ahead focus and timings. */
export function usePageSource(): PageSourceState {
  const [source, setSource] = useState<OpenedSource | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastPageMs, setLastPageMs] = useState<number | null>(null);
  const [stats, setStats] = useState<ReaderStats | null>(null);
  const [revision, setRevision] = useState<number | undefined>(undefined);
  const pageRequestedAt = useRef(0);

  // Pages are rendered no larger than the frame they are shown in.
  useEffect(() => {
    const hint = () => {
      const box = deviceBox(
        Math.min(window.innerWidth, FRAME_MAX_CSS_WIDTH),
        window.innerHeight * FRAME_HEIGHT_SHARE,
        window.devicePixelRatio
      );
      setViewport(box.maxWidth, box.maxHeight).then(
        state => setRevision(state.revision),
        (e: unknown) => setError(message(e))
      );
    };
    hint();
    window.addEventListener('resize', hint);
    return () => window.removeEventListener('resize', hint);
  }, []);

  const refreshStats = useCallback(() => {
    readerStats().then(setStats, (e: unknown) => setError(message(e)));
  }, []);

  const open = useCallback(
    async (path: string) => {
      setError(null);
      try {
        const opened = await openSource(path);
        if (source) await closeSource(source.id);
        pageRequestedAt.current = performance.now();
        setSource(opened);
        setIndex(0);
        await focusPage(opened.id, 0, 'forward');
        refreshStats();
      } catch (e) {
        setError(message(e));
      }
    },
    [source, refreshStats]
  );

  const step = useCallback(
    (delta: number) => {
      if (!source) return;
      const next = stepPage(index, delta, source.pages.length);
      if (next.index === index) return;
      pageRequestedAt.current = performance.now();
      setIndex(next.index);
      focusPage(source.id, next.index, next.direction).then(refreshStats, (e: unknown) =>
        setError(message(e))
      );
    },
    [source, index, refreshStats]
  );

  const onPageLoaded = useCallback(() => {
    setLastPageMs(performance.now() - pageRequestedAt.current);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown') step(1);
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  return { source, index, error, lastPageMs, stats, revision, open, step, onPageLoaded };
}
