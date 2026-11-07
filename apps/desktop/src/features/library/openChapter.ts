import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';

/**
 * The one hand-off from the library into the reader. The reader owns
 * everything after this (opening the archive, landing on the saved page), so
 * the library only passes ids through the route. When the reader exposes its
 * own `openChapter` entry this adapter is the single place to call it from.
 */
export function useOpenChapter(): (seriesId: number, chapterId: number) => void {
  const navigate = useNavigate();
  return useCallback(
    (seriesId: number, chapterId: number) => {
      void navigate({
        to: '/read/$seriesId/$chapterId',
        params: { seriesId: String(seriesId), chapterId: String(chapterId) },
      });
    },
    [navigate]
  );
}
