import { useEffect, useState } from 'react';

import { nextTarget, prefetchChapter, type ChapterLink, type LoadedChapter } from '../useChapter';

/**
 * Opens the next chapter ahead of time once `wanted` turns true (the reader
 * nears the end) and keeps it open while this reader is up, so moving on
 * shows no loading screen and webtoon can lay the next pages under the last
 * ones. Returns the chapter once it is ready. Unmounting hands it over to the
 * next reader or, if nobody takes it, closes it.
 */
export function useNextChapter(next: ChapterLink | null, wanted: boolean): LoadedChapter | null {
  const [asked, setAsked] = useState(false);
  const [ready, setReady] = useState<{ chapterId: number; chapter: LoadedChapter } | null>(null);
  // Once asked, keep it: scrolling back up should not close and reopen it.
  if (wanted && !asked) setAsked(true);
  const chapterId = asked && next ? next.chapterId : null;

  useEffect(() => {
    if (chapterId === null || !next) return;
    let alive = true;
    const { promise, release } = prefetchChapter(nextTarget(next));
    promise.then(
      chapter => {
        if (alive) setReady({ chapterId, chapter });
      },
      () => {
        // The normal open after the end card shows the error.
      }
    );
    return () => {
      alive = false;
      release();
    };
    // The chapter id names the target; `next` is a new object every load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  return ready && ready.chapterId === chapterId ? ready.chapter : null;
}
