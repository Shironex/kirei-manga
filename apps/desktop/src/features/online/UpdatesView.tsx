import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Check, KeyRound, RefreshCw, Users } from 'lucide-react';

import { EmptyState } from '@/components/page/EmptyState';
import { Button } from '@/components/ui/button';
import { Cover } from '@/features/library/Cover';
import {
  getFeed,
  markFeedSeen,
  onFeedChanged,
  onlineCoverUrl,
  refreshFeed,
  toOnlineError,
  type FeedGroup,
} from '@/lib/online';
import { isTauri } from '@/lib/ipc';
import { useSetting } from '@/lib/settings/store';
import { cn } from '@/lib/utils';

import { useAccount } from './account';
import { chapterLabel, creditLine, errorText, mangaTitle, timeAgo } from './model';
import { useOnlineQuery } from './useOnlineQuery';

/** Chapters shown per series before "and N more". */
const PER_SERIES = 5;

/**
 * New chapters of followed series, grouped by series with the newest on top.
 * Rust refreshes the feed on a schedule (and tells this view through an
 * event); the button asks for a refresh now.
 */
export function UpdatesView() {
  const account = useAccount();
  const signedIn = account.session !== 'signedOut';
  const feed = useOnlineQuery(signedIn ? 'feed' : null, getFeed);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef(false);
  const { reload } = feed;

  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = onFeedChanged(reload);
    return () => {
      void unlisten.then(stop => stop());
    };
  }, [reload]);

  useEffect(() => setNow(Date.now()), [feed.data]);

  // Opening the feed counts as seeing it: the "new" marks stay for this
  // visit and are gone next time.
  useEffect(() => {
    if (seen.current || !feed.data) return;
    if (feed.data.groups.some(group => group.chapters.some(entry => entry.new))) {
      seen.current = true;
      void markFeedSeen().catch(() => {});
    }
  }, [feed.data]);

  if (!signedIn) {
    return (
      <EmptyState
        title="Sign in to get your updates"
        actions={
          <Button variant="primary" asChild>
            <Link to="/settings" search={{ section: 'accounts' }}>
              <KeyRound /> Sign in to MangaDex
            </Link>
          </Button>
        }
      >
        <p>
          New chapters of the series you follow on MangaDex land here, in your languages, with a
          notification when they arrive.
        </p>
      </EmptyState>
    );
  }

  const refresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      feed.set(await refreshFeed());
    } catch (reason) {
      setRefreshError(errorText(toOnlineError(reason)));
    } finally {
      setRefreshing(false);
    }
  };

  const data = feed.data;
  const failure = refreshError ?? (feed.status === 'error' ? errorText(feed.error) : null);
  return (
    <section aria-label="New chapters">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" disabled={refreshing} onClick={() => void refresh()}>
          <RefreshCw className={cn(refreshing && 'animate-spin')} />
          {refreshing ? 'Checking MangaDex' : 'Check now'}
        </Button>
        {data?.lastRefresh && (
          <span className="text-sm text-fg-3">Checked {timeAgo(data.lastRefresh, now)}</span>
        )}
        <p aria-live="polite" className="m-0 empty:hidden">
          {failure && <span className="text-sm text-err">{failure}</span>}
        </p>
      </div>

      {!data && feed.status === 'loading' && (
        <p aria-live="polite" className="text-sm text-fg-3">
          Loading your updates
        </p>
      )}
      {data && data.groups.length === 0 && (
        <EmptyState title="Nothing new yet">
          <p>
            {data.lastRefresh
              ? 'No new chapters in your languages since the last check. Follow more series from Search.'
              : 'The first check runs shortly after signing in. Check now to fill the feed at once.'}
          </p>
        </EmptyState>
      )}
      {data && data.groups.length > 0 && (
        <ol className="m-0 grid max-w-[860px] list-none gap-4 p-0">
          {data.groups.map(group => (
            <li key={group.mangaId}>
              <FeedSeries group={group} now={now} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function FeedSeries({ group, now }: { group: FeedGroup; now: number }) {
  const [chain] = useSetting('online.languages');
  const title = group.manga ? mangaTitle(group.manga, chain) : 'A followed series';
  const shown = group.chapters.slice(0, PER_SERIES);
  const more = group.chapters.length - shown.length;
  return (
    <article className="grid grid-cols-[72px_minmax(0,1fr)] gap-4 rounded-panel border border-line bg-ink-1 p-4">
      <Link to="/online/$mangaId" params={{ mangaId: group.mangaId }} tabIndex={-1} aria-hidden>
        <Cover
          cover={null}
          src={group.manga ? onlineCoverUrl(group.manga, 256) : null}
          title={title}
        />
      </Link>
      <div className="min-w-0">
        <header className="mb-2 flex items-baseline gap-3">
          <h3 className="m-0 min-w-0 truncate text-md font-semibold">
            <Link
              to="/online/$mangaId"
              params={{ mangaId: group.mangaId }}
              className="text-fg-1 no-underline hover:underline"
            >
              {title}
            </Link>
          </h3>
          {group.unread > 0 && (
            <span className="shrink-0 tabular text-xs text-accent">{group.unread} unread</span>
          )}
          <span className="ml-auto shrink-0 tabular text-xs text-fg-3">
            {timeAgo(group.latestAt, now)}
          </span>
        </header>
        <ul className="m-0 grid list-none p-0">
          {shown.map(({ chapter, read, new: fresh }) => (
            <li key={chapter.id}>
              <Link
                to="/read/online/$mangaId/$chapterId"
                params={{ mangaId: group.mangaId, chapterId: chapter.id }}
                className="-mx-2 grid grid-cols-[minmax(0,auto)_auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-fg-1 no-underline hover:bg-ink-2"
              >
                <span className={cn('font-medium', read && 'text-fg-3')}>
                  {chapterLabel(chapter)}
                  {chapter.chapter && chapter.title ? `: ${chapter.title}` : ''}
                </span>
                <span className="rounded-chip bg-fg-1/6 px-1.5 py-px text-xs font-medium text-fg-2 uppercase">
                  {chapter.language}
                </span>
                <span className="inline-flex min-w-0 items-center gap-1 truncate text-xs text-fg-3">
                  <Users className="size-3 shrink-0" aria-hidden />
                  {creditLine(chapter)}
                </span>
                <span className="flex items-center gap-2 text-xs">
                  {fresh && !read && <span className="font-semibold text-accent">New</span>}
                  {read && <Check className="size-3.5 text-fg-3" aria-label="Read" />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {more > 0 && (
          <Link
            to="/online/$mangaId"
            params={{ mangaId: group.mangaId }}
            className="mt-1 inline-block text-xs text-fg-3 hover:text-fg-1"
          >
            and {more} more
          </Link>
        )}
      </div>
    </article>
  );
}
