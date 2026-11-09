import { useEffect, useId, useState } from 'react';
import { LoaderCircle, Search } from 'lucide-react';

import { Tag } from '@/components/ui/chip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { LIST_STATUS_LABEL, mediaTitle, searchManga, type Media } from '@/lib/tracking';
import { cn } from '@/lib/utils';

/** Waits this long after the last keystroke before searching AniList. */
const SEARCH_DELAY_MS = 400;

const FORMAT_LABEL: Record<string, string> = {
  MANGA: 'Manga',
  NOVEL: 'Novel',
  ONE_SHOT: 'One shot',
};

function describeMedia(media: Media): string {
  return [
    media.format ? (FORMAT_LABEL[media.format] ?? media.format) : null,
    media.startYear?.toString(),
    media.chapters ? `${media.chapters} chapters` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Picks the AniList entry for a series: searches by the series title (the
 * ComicInfo title when the archives carry one) and lists the matches, with a
 * hint on the ones that started in the same year.
 */
export function LinkDialog({
  open,
  onOpenChange,
  initialQuery,
  year,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery: string;
  year: number | null;
  onPick: (media: Media) => Promise<void>;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Media[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const inputId = useId();
  const listId = useId();

  useEffect(() => {
    if (open) setQuery(initialQuery);
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open) return;
    const text = query.trim();
    if (!text) {
      setResults(null);
      return;
    }
    let live = true;
    setLoading(false);
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchManga(text)
        .then(
          page => live && setResults(page.media),
          (e: unknown) => live && setError(e instanceof Error ? e.message : String(e))
        )
        .finally(() => live && setLoading(false));
    }, SEARCH_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, query]);

  const pick = async (media: Media) => {
    setPicking(media.id);
    setError(null);
    try {
      await onPick(media);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(600px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>Link to AniList</DialogTitle>
          <DialogDescription>
            Pick the AniList entry for this series. Its progress is synced from then on.
          </DialogDescription>
        </DialogHeader>
        <label htmlFor={inputId} className="sr-only">
          Search AniList
        </label>
        <Input
          id={inputId}
          icon={<Search />}
          value={query}
          autoFocus
          placeholder="Search by title"
          aria-controls={listId}
          onChange={e => setQuery(e.target.value)}
        />
        <div aria-live="polite" className="min-h-5 text-sm">
          {loading && (
            <span className="flex items-center gap-2 text-fg-3">
              <LoaderCircle
                aria-hidden
                className="size-4 animate-spin motion-reduce:animate-none"
              />
              Searching AniList
            </span>
          )}
          {!loading && error && <span className="text-err">{error}</span>}
          {!loading && !error && results?.length === 0 && (
            <span className="text-fg-3">Nothing on AniList matches that title.</span>
          )}
        </div>
        <ul id={listId} className="m-0 grid max-h-[50vh] list-none gap-1 overflow-y-auto p-0">
          {results?.map(media => {
            const sameYear = year !== null && media.startYear === year;
            return (
              <li key={media.id}>
                <button
                  type="button"
                  disabled={picking !== null}
                  onClick={() => void pick(media)}
                  className={cn(
                    'grid w-full grid-cols-[44px_minmax(0,1fr)] items-center gap-3 rounded-lg p-2 text-left',
                    'transition-colors duration-base hover:enabled:bg-ink-2 focus-visible:bg-ink-2',
                    'disabled:cursor-wait disabled:opacity-60'
                  )}
                >
                  {media.cover ? (
                    <img
                      src={media.cover}
                      alt=""
                      loading="lazy"
                      className="aspect-[2/3] w-11 rounded object-cover"
                    />
                  ) : (
                    <span aria-hidden className="aspect-[2/3] w-11 rounded bg-ink-3" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{mediaTitle(media)}</span>
                    <span className="tabular block truncate text-sm text-fg-3">
                      {describeMedia(media)}
                    </span>
                    {(sameYear || media.listEntry) && (
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {sameYear && <Tag>Same year</Tag>}
                        {media.listEntry?.status && (
                          <Tag>
                            {LIST_STATUS_LABEL[media.listEntry.status]}, chapter{' '}
                            {media.listEntry.progress}
                          </Tag>
                        )}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
