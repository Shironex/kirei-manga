import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';

/**
 * What the reader opens: a chapter of a library series (progress is recorded
 * and per series settings apply) or any archive or folder on disk.
 * `page` (0 based) overrides where reading starts; by default a library
 * chapter resumes from its saved progress and a file starts at the first page.
 */
export type ChapterTarget =
  | { kind: 'library'; seriesId: number; chapterId: number; page?: number }
  | { kind: 'file'; path: string; page?: number }
  | { kind: 'online'; mangaId: string; chapterId: string; page?: number };

/**
 * The one way into the reader. Library views call it with a chapter id, the
 * engine bench and the file dialog with a path.
 *
 * ```ts
 * const openChapter = useOpenChapter();
 * openChapter({ kind: 'library', seriesId, chapterId });
 * openChapter({ kind: 'file', path });
 * ```
 */
export function useOpenChapter(): (target: ChapterTarget, options?: { replace?: boolean }) => void {
  const navigate = useNavigate();
  return useCallback(
    (target, options) => {
      const replace = options?.replace ?? false;
      if (target.kind === 'library') {
        void navigate({
          to: '/read/$seriesId/$chapterId',
          params: { seriesId: String(target.seriesId), chapterId: String(target.chapterId) },
          search: target.page === undefined ? {} : { page: target.page },
          replace,
        });
      } else if (target.kind === 'online') {
        void navigate({
          to: '/read/online/$mangaId/$chapterId',
          params: { mangaId: target.mangaId, chapterId: target.chapterId },
          search: target.page === undefined ? {} : { page: target.page },
          replace,
        });
      } else {
        void navigate({
          to: '/read/file',
          search:
            target.page === undefined
              ? { path: target.path }
              : { path: target.path, page: target.page },
          replace,
        });
      }
    },
    [navigate]
  );
}

/** Search params of the reader routes, validated from the URL. */
export function parsePageSearch(search: Record<string, unknown>): { page?: number } {
  const page = Number(search.page);
  return Number.isInteger(page) && page >= 0 ? { page } : {};
}

export function parseFileSearch(search: Record<string, unknown>): { path: string; page?: number } {
  return {
    path: typeof search.path === 'string' ? search.path : '',
    ...parsePageSearch(search),
  };
}
