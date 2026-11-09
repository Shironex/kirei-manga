import { Fragment } from 'react';
import { Link } from '@tanstack/react-router';
import { Check, CircleDashed, Download, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { openMangaDex, type Chapter, type Marker } from '@/lib/online';
import { cn } from '@/lib/utils';

import { chapterLabel, creditLine, languageLabel, parseTime, timeAgo } from './model';

/**
 * A MangaDex chapter list: label, language (marked when it is a fallback),
 * the scanlation group credit, when it came out and the read state. Rows open
 * the chapter in the reader; a chapter hosted by its publisher opens on
 * MangaDex instead.
 */
export function OnlineChapterList({
  mangaId,
  chapters,
  preferred,
  markers,
  now,
  onToggleRead,
  onDownload,
}: {
  mangaId: string;
  chapters: Chapter[];
  preferred: string;
  markers: Record<string, Marker>;
  now: number;
  onToggleRead: (chapter: Chapter, read: boolean) => void;
  onDownload: (chapter: Chapter) => void;
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
              <li aria-hidden className="pt-6 pb-2 text-xs font-medium text-fg-3 first:pt-2">
                {chapter.volume ? `Volume ${chapter.volume}` : 'No volume'}
              </li>
            )}
            <li className="-mx-3 [contain-intrinsic-size:auto_64px] [content-visibility:auto]">
              <ChapterRow
                mangaId={mangaId}
                chapter={chapter}
                fallback={chapter.language !== preferred}
                marker={markers[chapter.id]}
                now={now}
                onToggleRead={read => onToggleRead(chapter, read)}
                onDownload={() => onDownload(chapter)}
              />
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

function ChapterRow({
  mangaId,
  chapter,
  fallback,
  marker,
  now,
  onToggleRead,
  onDownload,
}: {
  mangaId: string;
  chapter: Chapter;
  fallback: boolean;
  marker: Marker | undefined;
  now: number;
  onToggleRead: (read: boolean) => void;
  onDownload: () => void;
}) {
  const label = chapterLabel(chapter);
  const title = chapter.chapter && chapter.title ? chapter.title : null;
  const read = marker?.read ?? false;
  const started = !read && (marker?.page ?? 0) > 0;
  const published = parseTime(chapter.publishAt ?? chapter.readableAt);
  const external = chapter.externalUrl !== null;

  const body = (
    <>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className={cn('font-medium', read && 'text-fg-3')}>{label}</span>
        {title && <span className="truncate text-fg-2">{title}</span>}
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-fg-3">
        <span
          className={cn(
            'rounded-chip px-1.5 py-px font-medium uppercase',
            fallback ? 'bg-warn/15 text-warn' : 'bg-fg-1/6 text-fg-2'
          )}
          title={fallback ? `Fallback: ${languageLabel(chapter.language)}` : undefined}
        >
          {chapter.language}
          {fallback && (
            <span className="sr-only">, filled from {languageLabel(chapter.language)}</span>
          )}
        </span>
        <span className="inline-flex min-w-0 items-center gap-1 truncate">
          <Users className="size-3 shrink-0" aria-hidden />
          {creditLine(chapter)}
        </span>
        {published !== null && <span className="tabular">{timeAgo(published, now)}</span>}
        {started && <span className="tabular text-accent">Page {(marker?.page ?? 0) + 1}</span>}
        {external && <span>On the publisher site</span>}
      </span>
    </>
  );

  return (
    <div className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-3 py-2.5 hover:bg-ink-2">
      {external ? (
        <button
          type="button"
          onClick={() => void openMangaDex({ kind: 'chapter', id: chapter.id })}
          className="grid min-w-0 gap-1 text-left outline-none focus-visible:outline-2 focus-visible:outline-accent"
        >
          {body}
        </button>
      ) : (
        <Link
          to="/read/online/$mangaId/$chapterId"
          params={{ mangaId, chapterId: chapter.id }}
          className="grid min-w-0 gap-1 text-fg-1 no-underline outline-none focus-visible:outline-2 focus-visible:outline-accent"
        >
          {body}
        </Link>
      )}
      <span className="flex items-center gap-1">
        {chapter.groups.length > 0 && (
          <Button
            variant="quiet"
            size="icon-sm"
            aria-label={`${chapter.groups[0]!.name} on MangaDex`}
            title="Scanlation group on MangaDex"
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => void openMangaDex({ kind: 'group', id: chapter.groups[0]!.id })}
          >
            <Users />
          </Button>
        )}
        {!external && (
          <Button
            variant="quiet"
            size="icon-sm"
            aria-label={`Download ${label}`}
            title="Download for offline reading"
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            onClick={onDownload}
          >
            <Download />
          </Button>
        )}
        <Button
          variant="quiet"
          size="icon-sm"
          aria-pressed={read}
          aria-label={read ? `Mark ${label} unread` : `Mark ${label} read`}
          title={read ? 'Read, click to mark unread' : 'Mark read'}
          onClick={() => onToggleRead(!read)}
          className={cn(read && 'text-accent')}
        >
          {read ? <Check /> : <CircleDashed />}
        </Button>
      </span>
    </div>
  );
}
