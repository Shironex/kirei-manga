import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import type { BookmarkWithChapter } from '@kireimanga/shared';
import { useSeriesBookmarks } from '@/hooks/useSeriesBookmarks';
import { useT } from '@/hooks/useT';

interface Props {
  mangadexSeriesId: string;
}

interface ChapterGroup {
  mangadexChapterId: string;
  chapterNumber?: number;
  volumeNumber?: number;
  chapterTitle?: string;
  bookmarks: BookmarkWithChapter[];
}

function groupBookmarks(list: BookmarkWithChapter[]): ChapterGroup[] {
  const byChapter = new Map<string, ChapterGroup>();
  for (const b of list) {
    const existing = byChapter.get(b.mangadexChapterId);
    if (existing) {
      existing.bookmarks.push(b);
    } else {
      byChapter.set(b.mangadexChapterId, {
        mangadexChapterId: b.mangadexChapterId,
        chapterNumber: b.chapterNumber,
        volumeNumber: b.volumeNumber,
        chapterTitle: b.chapterTitle,
        bookmarks: [b],
      });
    }
  }
  // Backend sort already places volume/chapter/page in reading order — we
  // just need to preserve insertion order, which Maps guarantee.
  return Array.from(byChapter.values());
}

function formatChapterHeader(group: ChapterGroup): string {
  const ch = group.chapterNumber !== undefined ? `Ch.${group.chapterNumber}` : 'Ch.—';
  const vol = group.volumeNumber !== undefined ? ` · Vol.${group.volumeNumber}` : '';
  const title = group.chapterTitle ? ` · ${group.chapterTitle}` : '';
  return `${ch}${vol}${title}`;
}

export function BookmarksPanel({ mangadexSeriesId }: Props) {
  const t = useT();
  const { bookmarks, remove } = useSeriesBookmarks(mangadexSeriesId);

  const groups = useMemo(() => groupBookmarks(bookmarks), [bookmarks]);

  if (groups.length === 0) return null;

  return (
    <section className="mt-14 flex flex-col">
      <header className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.26em] text-[var(--color-bone-faint)] uppercase">
          {t('series.bookmarks')}
        </span>
      </header>

      <div className="mt-4 flex flex-col">
        {groups.map(group => (
          <div key={group.mangadexChapterId} className="flex flex-col">
            <div className="mt-3 flex items-baseline border-b border-border pb-1.5 first:mt-0">
              <span className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-bone-muted)] uppercase">
                {formatChapterHeader(group)}
              </span>
            </div>
            {group.bookmarks.map(b => (
              <BookmarkRow
                key={b.id}
                bookmark={b}
                mangadexSeriesId={mangadexSeriesId}
                onRemove={() => void remove(b.id)}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function BookmarkRow({
  bookmark,
  mangadexSeriesId,
  onRemove,
}: {
  bookmark: BookmarkWithChapter;
  mangadexSeriesId: string;
  onRemove: () => void;
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-[3rem_1fr_auto_1.5rem] items-center gap-x-4 border-b border-border py-2.5 text-[13px] last:border-b-0 hover:bg-[var(--color-ink-raised)]">
      <span className="font-mono text-[11px] tracking-[0.16em] text-[var(--color-bone-faint)] uppercase">
        {t('chapterList.bookmarks.page', { page: bookmark.page + 1 })}
      </span>
      <span className="truncate text-foreground">
        {bookmark.note ? bookmark.note : <span className="text-[var(--color-bone-faint)]">—</span>}
      </span>
      <Link
        to={`/reader/${mangadexSeriesId}/${bookmark.mangadexChapterId}?page=${bookmark.page}`}
        className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-bone-muted)] uppercase underline-offset-4 hover:text-foreground hover:underline"
      >
        {t('chapterList.bookmarks.jump')}
      </Link>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('chapterList.bookmarks.removeAria')}
        className="flex items-center justify-center text-[var(--color-bone-faint)] transition-colors hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
