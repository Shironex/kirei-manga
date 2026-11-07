import { Fragment } from 'react';
import { Check, TriangleAlert } from 'lucide-react';

import { chapterLabel, type ChapterEntry } from '@/lib/library';
import { cn } from '@/lib/utils';

import { chapterNumber } from '../library/format';

function volumeName(volume: number | null): string {
  return volume === null
    ? 'No volume'
    : `Volume ${chapterNumber({ volume: null, number: volume, title: null })}`;
}

/**
 * Chapters in the order given, with a heading whenever the volume changes.
 * Rows skip layout and paint while off screen (content-visibility), which keeps
 * a series with a thousand chapters as cheap as one with ten.
 */
export function ChapterList({
  chapters,
  currentId,
  onOpen,
}: {
  chapters: ChapterEntry[];
  /** The chapter "continue" opens; it shows its page. */
  currentId: number | null;
  onOpen: (chapter: ChapterEntry) => void;
}) {
  const grouped = chapters.some(c => c.volume !== null);
  return (
    <ol className="m-0 grid list-none p-0">
      {chapters.map((chapter, index) => {
        const newVolume =
          grouped && (index === 0 || chapters[index - 1]?.volume !== chapter.volume);
        return (
          <Fragment key={chapter.id}>
            {newVolume && (
              <li aria-hidden className="px-0 pt-6 pb-2 text-xs font-medium text-fg-3 first:pt-2">
                {volumeName(chapter.volume)}
              </li>
            )}
            <li className="-mx-3 [contain-intrinsic-size:auto_64px] [content-visibility:auto]">
              <ChapterRow
                chapter={chapter}
                current={chapter.id === currentId}
                onOpen={() => onOpen(chapter)}
              />
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

function ChapterRow({
  chapter,
  current,
  onOpen,
}: {
  chapter: ChapterEntry;
  current: boolean;
  onOpen: () => void;
}) {
  const progress = chapter.progress;
  const read = progress?.completed ?? false;
  const inProgress = progress && !progress.completed && progress.page > 0;
  const title =
    chapter.title ??
    (chapter.number !== null ? `Chapter ${chapterNumber(chapter)}` : chapterLabel(chapter));
  const label = [chapterLabel(chapter), chapter.title].filter(Boolean).join(', ');

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={chapter.missing}
      aria-label={[
        label,
        read && 'read',
        inProgress && `page ${progress.page + 1} of ${progress.pageCount}`,
        chapter.missing && 'missing from disk',
        chapter.error && 'could not be opened',
      ]
        .filter(Boolean)
        .join(', ')}
      aria-current={current ? 'step' : undefined}
      className={cn(
        'grid w-full grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-4 rounded-[10px] px-3 py-3 text-left text-fg-1',
        'transition-colors duration-base hover:enabled:bg-fg-1/[0.04]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        current && 'bg-accent-wash hover:enabled:bg-accent-wash'
      )}
    >
      <span
        className={cn(
          'tabular font-display text-xl leading-none font-[650] [font-variation-settings:"wdth"_80]',
          read && 'text-fg-3'
        )}
      >
        {chapter.number !== null ? chapterNumber(chapter) : ''}
      </span>
      <span className="min-w-0">
        <span className={cn('block truncate font-medium', read && 'text-fg-3')}>{title}</span>
        <span className="mt-0.5 flex items-center gap-2.5 text-xs text-fg-3">
          {chapter.language && (
            <span className="rounded-[4px] bg-fg-1/[0.08] px-1.5 py-px text-[11px] font-semibold text-fg-2 uppercase">
              {chapter.language}
            </span>
          )}
          {chapter.scanGroup && <span className="truncate">{chapter.scanGroup}</span>}
          <span className="tabular shrink-0">
            {chapter.pageCount > 0 ? `${chapter.pageCount} pages` : chapter.kind.toUpperCase()}
          </span>
        </span>
      </span>
      <span className="tabular flex items-center gap-2 text-xs text-fg-3">
        {chapter.missing ? (
          <span>Missing</span>
        ) : chapter.error ? (
          <span className="flex items-center gap-1.5 text-warn" title={chapter.error}>
            <TriangleAlert className="size-4" aria-hidden /> Could not open
          </span>
        ) : inProgress ? (
          <span className="font-medium text-accent">
            Page {progress.page + 1} of {progress.pageCount}
          </span>
        ) : read ? (
          <Check className="size-4" aria-hidden />
        ) : null}
      </span>
    </button>
  );
}
