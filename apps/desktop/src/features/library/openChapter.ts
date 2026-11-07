import { useCallback } from 'react';

import { useOpenChapter as useReaderEntry } from '@/features/reader/openChapter';

/**
 * The one hand-off from the library into the reader, through the reader's
 * own `openChapter` entry. The reader owns everything after this (opening the
 * archive, resuming from the saved page), so the library only passes ids.
 */
export function useOpenChapter(): (seriesId: number, chapterId: number) => void {
  const openChapter = useReaderEntry();
  return useCallback(
    (seriesId: number, chapterId: number) => {
      openChapter({ kind: 'library', seriesId, chapterId });
    },
    [openChapter]
  );
}
