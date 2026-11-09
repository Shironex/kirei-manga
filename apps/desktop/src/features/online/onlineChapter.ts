import type { LoadedChapter } from '@/features/reader/useChapter';
import { openOnlineChapter, toOnlineError } from '@/lib/online';
import { pageMeta } from '@/lib/reader';
import { getSettingsState } from '@/lib/settings/store';

import { chapterLabel, creditLine, errorText, mangaTitle } from './model';

/**
 * Opens a MangaDex chapter as a reader source. Pages come through the same
 * pipeline as an archive (fetched in Rust from MangaDex@Home, reported back,
 * cached, read ahead), never hotlinked. The reader bar credits the
 * scanlation group and MangaDex.
 */
export async function loadOnlineChapter(target: {
  mangaId: string;
  chapterId: string;
  page?: number;
}): Promise<LoadedChapter> {
  let opened;
  try {
    opened = await openOnlineChapter(target.mangaId, target.chapterId);
  } catch (reason) {
    const error = toOnlineError(reason);
    throw new Error(
      error.kind === 'external'
        ? 'MangaDex links this chapter to an official release, so it opens on the publisher site. Use "Open on MangaDex".'
        : errorText(error),
      { cause: reason }
    );
  }
  const meta = await pageMeta(opened.id);
  const chain = getSettingsState().settings['online.languages'];
  const label = chapterLabel(opened.chapter);
  const named = opened.chapter.title && opened.chapter.chapter ? `, ${opened.chapter.title}` : '';
  const last = Math.max(0, opened.pages.length - 1);
  return {
    source: { id: opened.id, kind: 'online', pages: opened.pages, openMs: 0 },
    pages: meta.pages,
    title: mangaTitle(opened.manga, chain),
    subtitle: `${label}${named} · ${creditLine(opened.chapter)} · via MangaDex`,
    label,
    seriesId: null,
    chapterId: null,
    startPage: Math.min(target.page ?? opened.startPage, last),
    startOffset: 0,
    carry: null,
    manga: null,
    settings: null,
    cover: null,
    next: opened.next
      ? {
          kind: 'online',
          mangaId: target.mangaId,
          chapterId: opened.next.id,
          label: chapterLabel(opened.next),
          title: opened.next.title,
        }
      : null,
    online: { mangaId: target.mangaId, chapterId: target.chapterId },
    lastNote: 'That was the latest chapter in your languages on MangaDex.',
  };
}
