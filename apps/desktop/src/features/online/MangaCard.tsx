import { Link } from '@tanstack/react-router';

import { Cover } from '@/features/library/Cover';
import { onlineCoverUrl, type Manga } from '@/lib/online';
import { useSetting } from '@/lib/settings/store';
import { cn } from '@/lib/utils';

import { mangaTitle } from './model';

/** A MangaDex series in a grid: cover, title and one line of facts. Opens its page. */
export function MangaCard({
  manga,
  caption,
  className,
}: {
  manga: Manga;
  /** Replaces the default line (year and status), such as a reading status. */
  caption?: string;
  className?: string;
}) {
  const [chain] = useSetting('online.languages');
  const title = mangaTitle(manga, chain);
  const facts =
    caption ??
    [manga.year, manga.status && manga.status[0]!.toUpperCase() + manga.status.slice(1)]
      .filter(Boolean)
      .join(' · ');
  return (
    <Link
      to="/online/$mangaId"
      params={{ mangaId: manga.id }}
      className={cn(
        'group grid content-start gap-2.5 rounded-cover text-fg-1 no-underline outline-none',
        className
      )}
    >
      <Cover
        cover={null}
        src={onlineCoverUrl(manga, 256)}
        title={title}
        className={cn(
          'transition-[transform,box-shadow] duration-slow ease-expo',
          'group-hover:-translate-y-1 group-focus-visible:-translate-y-1',
          'group-focus-visible:outline-2 group-focus-visible:outline-offset-[3px] group-focus-visible:outline-accent'
        )}
      />
      <span className="grid gap-0.5">
        <span className="line-clamp-2 leading-[1.3] font-semibold">{title}</span>
        {facts && <span className="tabular text-xs text-fg-3">{facts}</span>}
      </span>
    </Link>
  );
}

/** The grid MangaDex covers sit in. */
export function MangaGrid({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <ul
      aria-label={label}
      className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-6 gap-y-8 p-0"
    >
      {children}
    </ul>
  );
}
