import { useCallback, useEffect, useRef, useState } from 'react';

import {
  closeSource,
  focusPage,
  openSource,
  readerStats,
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
  open: (path: string) => Promise<void>;
  step: (delta: number) => void;
  onPageLoaded: () => void;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Owns one opened source: page position, read-ahead focus and timings. */
export function usePageSource(): PageSourceState {
  const [source, setSource] = useState<OpenedSource | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastPageMs, setLastPageMs] = useState<number | null>(null);
  const [stats, setStats] = useState<ReaderStats | null>(null);
  const pageRequestedAt = useRef(0);

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

  return { source, index, error, lastPageMs, stats, open, step, onPageLoaded };
}
