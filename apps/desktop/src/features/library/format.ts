import { chapterLabel, type ChapterEntry, type SeriesDetail } from '@/lib/library';

/** "Polski" for "pl": the language named in itself, as readers know it. */
export function languageName(code: string | null): string | null {
  if (!code) return null;
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase(code) + name.slice(1) : code;
  } catch {
    return code.toUpperCase();
  }
}

/** The chapter number on its own when there is one ("42", "10.5"), else the short label. */
export function chapterNumber(chapter: Pick<ChapterEntry, 'volume' | 'number' | 'title'>): string {
  if (chapter.number !== null) {
    return Number.isInteger(chapter.number)
      ? String(chapter.number)
      : String(Number(chapter.number.toFixed(2)));
  }
  return chapterLabel(chapter);
}

/** The chapter "continue" opens, from a detail. */
export function continueChapter(detail: SeriesDetail): ChapterEntry | null {
  return detail.chapters.find(c => c.id === detail.continueChapterId) ?? null;
}

/** Label for the main action of a series: start, resume or read again. */
export function readActionLabel(
  detail: SeriesDetail,
  chapter: ChapterEntry | null,
  verb: 'Continue' | 'Resume' = 'Continue'
): string {
  if (!chapter) return 'Start reading';
  const started = detail.lastReadAt !== null;
  if (!started) return 'Start reading';
  if (detail.completedCount >= detail.chapterCount && chapter.progress?.completed) {
    return 'Read again';
  }
  return chapter.number !== null
    ? `${verb} chapter ${chapterNumber(chapter)}`
    : `${verb} ${chapterLabel(chapter)}`;
}
