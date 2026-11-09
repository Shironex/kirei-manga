import { useEffect, useState } from 'react';
import { getRouteApi, Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Heart,
  HeartOff,
  Info,
  TriangleAlert,
} from 'lucide-react';

import { EmptyState } from '@/components/page/EmptyState';
import { usePageHeading } from '@/components/page/usePageHeading';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/chip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SeriesShelfCard } from '@/features/collections/SeriesShelfCard';
import {
  addToWantToRead,
  isWanted,
  removeFromWantToRead,
  useShelf,
} from '@/features/collections/shelfStore';
import { Cover } from '@/features/library/Cover';
import { TrackingCard } from '@/features/tracking/TrackingCard';
import { requestDownload } from '@/lib/downloads';
import {
  getOnlineChapters,
  getOnlineSeries,
  markChaptersRead,
  onlineCoverUrl,
  openMangaDex,
  setFollow,
  setReadingStatus,
  setSeriesLanguage,
  toOnlineError,
  type Chapter,
  type ReadingStatus,
} from '@/lib/online';
import { useSetting } from '@/lib/settings/store';
import type { SeriesRef } from '@/lib/shelf';
import { cn } from '@/lib/utils';

import { useAccount } from './account';
import { LanguagePicker } from './LanguagePicker';
import {
  bestText,
  chapterLabel,
  errorText,
  languageLabel,
  mangaTitle,
  outcomeNote,
  READING_STATUSES,
} from './model';
import { OnlineChapterList } from './OnlineChapterList';
import { MangaDexCredit, OnlineStatus } from './OnlineStatus';
import { useAnilistLink } from './useAnilistLink';
import { useOnlineQuery } from './useOnlineQuery';

const route = getRouteApi('/shell/online/$mangaId');

const ALL_LANGUAGES = 'all';
const NO_STATUS = 'none';

/** `/online/$mangaId`: a MangaDex series with its chapters in the reader's languages. */
export function OnlineSeriesPage() {
  const { mangaId } = route.useParams();
  const account = useAccount();
  const signedIn = account.session === 'signedIn';
  const [chain] = useSetting('online.languages');
  const [only] = useSetting('online.onlyMyLanguage');
  const series = useOnlineQuery(mangaId, () => getOnlineSeries(mangaId));
  const single = series.data?.singleLanguage ?? null;
  const chapters = useOnlineQuery(`${mangaId}|${chain.join(',')}|${only}|${single ?? ''}`, () =>
    getOnlineChapters(mangaId)
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => setNow(Date.now()), [chapters.data]);

  const title = series.data ? mangaTitle(series.data.manga, chain) : 'MangaDex series';
  const headingRef = usePageHeading(title);
  const trackingVersion = useAnilistLink(mangaId, series.data?.anilistId ?? null, title);
  const { want } = useShelf();

  if (series.status === 'error' && !series.data) {
    return (
      <>
        <BackLink />
        <OnlineStatus />
        <EmptyState
          tone="alert"
          title={
            series.error.kind === 'notFound'
              ? 'MangaDex has no such series'
              : 'This series did not load'
          }
          actions={
            <Button variant="primary" onClick={series.reload}>
              Try again
            </Button>
          }
        >
          <p>{errorText(series.error)}</p>
        </EmptyState>
      </>
    );
  }
  if (!series.data) {
    return (
      <>
        <BackLink />
        <p aria-live="polite" className="text-sm text-fg-3">
          Loading the series from MangaDex
        </p>
      </>
    );
  }

  const view = series.data;
  const { manga } = view;
  const description = bestText(manga.description, chain);
  const people = [...new Set([...manga.authors, ...manga.artists].map(p => p.name))];
  const facts = [
    manga.year,
    manga.status && manga.status[0]!.toUpperCase() + manga.status.slice(1),
    manga.demographic && manga.demographic !== 'none'
      ? manga.demographic[0]!.toUpperCase() + manga.demographic.slice(1)
      : null,
    manga.contentRating !== 'safe' ? manga.contentRating : null,
  ].filter(Boolean);

  // How the shelf names this title; the title and cover file are cached so
  // Want to Read and collections show it offline.
  const shelfRef: SeriesRef = {
    source: 'mangadex',
    remoteId: mangaId,
    title,
    coverFile: manga.cover?.fileName ?? null,
  };
  const wanted = isWanted(want, shelfRef);
  const toggleWant = async () => {
    setActionError(null);
    try {
      await (wanted ? removeFromWantToRead(shelfRef) : addToWantToRead(shelfRef));
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (reason) {
      setActionError(errorText(toOnlineError(reason)));
    }
  };

  const follow = (next: boolean) =>
    run(async () => {
      await setFollow(mangaId, next);
      series.set({
        ...view,
        following: next,
        readingStatus: next ? (view.readingStatus ?? 'reading') : null,
      });
    });

  const changeStatus = (value: string) =>
    run(async () => {
      const status = value === NO_STATUS ? null : (value as ReadingStatus);
      await setReadingStatus(mangaId, status);
      series.set({ ...view, readingStatus: status });
    });

  const changeLanguage = (value: string) =>
    run(async () => {
      const language = value === ALL_LANGUAGES ? null : value;
      await setSeriesLanguage(mangaId, language);
      series.set({ ...view, singleLanguage: language });
    });

  const toggleRead = (chapter: Chapter, read: boolean) =>
    run(async () => {
      const markers = await markChaptersRead(mangaId, [chapter.id], read);
      if (chapters.data)
        chapters.set({ ...chapters.data, markers: { ...chapters.data.markers, ...markers } });
    });

  const download = (chapter: Chapter) =>
    run(async () => {
      const added = await requestDownload([chapter.id]);
      setNotice(
        added.length > 0
          ? `${chapterLabel(chapter)} added to downloads.`
          : `${chapterLabel(chapter)} is already downloaded or queued.`
      );
    });

  const list = chapters.data;
  const firstUnread = list?.chapters.find(c => !list.markers[c.id]?.read && !c.externalUrl);
  const note = list ? outcomeNote(list.outcome, list.preferred, list.singleLanguage) : null;
  const seriesLanguages = [...new Set(list?.chapters.map(c => c.language) ?? [])];
  const offered = [...new Set([...chain, ...manga.availableLanguages])];

  return (
    <>
      <BackLink />
      <OnlineStatus />
      <header className="mb-8 grid grid-cols-[200px_minmax(0,1fr)] items-start gap-8">
        <Cover cover={null} src={onlineCoverUrl(manga, 512)} title={title} />
        <div className="min-w-0">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="m-0 mb-2 font-display text-4xl font-bold tracking-[-0.01em] outline-none [font-variation-settings:'wdth'_80,'opsz'_72]"
          >
            {title}
          </h1>
          {people.length > 0 && <p className="m-0 mb-1 text-fg-2">{people.join(', ')}</p>}
          {facts.length > 0 && (
            <p className="m-0 mb-3 tabular text-sm text-fg-3">{facts.join(' · ')}</p>
          )}
          {manga.tags.length > 0 && (
            <ul aria-label="Tags" className="m-0 mb-4 flex list-none flex-wrap gap-1.5 p-0">
              {manga.tags.slice(0, 12).map(tag => (
                <li key={tag.id}>
                  <Tag>{bestText(tag.name, chain) ?? tag.id}</Tag>
                </li>
              ))}
            </ul>
          )}
          {description && (
            <p className="m-0 mb-5 line-clamp-5 max-w-[70ch] text-sm whitespace-pre-line text-fg-2">
              {description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {firstUnread && (
              <Button variant="primary" asChild>
                <Link
                  to="/read/online/$mangaId/$chapterId"
                  params={{ mangaId, chapterId: firstUnread.id }}
                >
                  <BookOpen /> Read {firstUnread.chapter ? `Ch. ${firstUnread.chapter}` : 'now'}
                </Link>
              </Button>
            )}
            <Button variant="ghost" aria-pressed={wanted} onClick={() => void toggleWant()}>
              {wanted ? <BookmarkCheck className="text-accent" /> : <Bookmark />}
              {wanted ? 'In Want to Read' : 'Want to Read'}
            </Button>
            {signedIn ? (
              <>
                <Button variant="ghost" onClick={() => void follow(!view.following)}>
                  {view.following ? <HeartOff /> : <Heart />}
                  {view.following ? 'Unfollow' : 'Follow'}
                </Button>
                {view.following && (
                  <Select
                    value={view.readingStatus ?? NO_STATUS}
                    onValueChange={v => void changeStatus(v)}
                  >
                    <SelectTrigger aria-label="Reading status" className="h-10 w-40 rounded-pill">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_STATUS}>No status</SelectItem>
                      {READING_STATUSES.map(status => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </>
            ) : (
              <Button variant="ghost" asChild>
                <Link to="/settings" search={{ section: 'accounts' }}>
                  <Heart /> Sign in to follow
                </Link>
              </Button>
            )}
            <Button
              variant="quiet"
              onClick={() => void openMangaDex({ kind: 'title', id: mangaId })}
            >
              <ExternalLink /> MangaDex
            </Button>
          </div>
          <p aria-live="polite" className="m-0 mt-2 empty:hidden">
            {actionError && <span className="text-sm text-err">{actionError}</span>}
            {!actionError && notice && <span className="text-sm text-fg-3">{notice}</span>}
          </p>
          {view.cached && (
            <p className="m-0 mt-2 text-xs text-fg-3">
              Shown from the last visit while MangaDex is out of reach.
            </p>
          )}
        </div>
      </header>

      <div className="mb-8 grid max-w-[860px] items-start gap-4 md:grid-cols-2">
        <TrackingCard
          series={{ kind: 'mangadex', id: mangaId }}
          title={title}
          year={manga.year}
          version={trackingVersion}
        />
        <SeriesShelfCard series={shelfRef} title={title} wantToggle={false} />
      </div>

      <section aria-labelledby="online-chapters" className="max-w-[860px]">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 id="online-chapters" className="m-0 font-display text-2xl font-[650] font-condensed">
            Chapters
          </h2>
          <span className="flex-1" />
          <Select value={single ?? ALL_LANGUAGES} onValueChange={v => void changeLanguage(v)}>
            <SelectTrigger aria-label="Languages for this series" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_LANGUAGES}>My languages, filled per chapter</SelectItem>
              {offered.map(code => (
                <SelectItem key={code} value={code}>
                  Only {languageLabel(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!single && <LanguagePicker className="mb-4" compact extra={seriesLanguages} />}
        {note && (
          <p
            role="status"
            className={cn(
              'm-0 mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
              note.tone === 'warn' && 'bg-warn/10 text-fg-1',
              note.tone === 'info' && 'bg-accent-wash text-fg-1',
              note.tone === 'calm' && 'text-fg-3'
            )}
          >
            {note.tone === 'warn' ? (
              <TriangleAlert className="size-4 shrink-0 text-warn" aria-hidden />
            ) : (
              <Info className="size-4 shrink-0" aria-hidden />
            )}
            {note.text}
          </p>
        )}
        {chapters.status === 'error' && (
          <p role="alert" className="m-0 mb-4 text-sm text-err">
            {errorText(chapters.error)}{' '}
            <button type="button" className="underline" onClick={chapters.reload}>
              Try again
            </button>
          </p>
        )}
        {!list && chapters.status === 'loading' && (
          <p aria-live="polite" className="text-sm text-fg-3">
            Loading chapters
          </p>
        )}
        {list && list.chapters.length > 0 && (
          <div className={cn(chapters.status === 'loading' && 'opacity-60')}>
            <OnlineChapterList
              mangaId={mangaId}
              chapters={list.chapters}
              preferred={list.singleLanguage ?? list.preferred}
              markers={list.markers}
              now={now}
              onToggleRead={(chapter, read) => void toggleRead(chapter, read)}
              onDownload={chapter => void download(chapter)}
            />
          </div>
        )}
        <MangaDexCredit className="mt-8" />
      </section>
    </>
  );
}

function BackLink() {
  return (
    <Button variant="quiet" size="sm" asChild className="mb-4 -ml-3">
      <Link to="/browse">
        <ArrowLeft /> Browse
      </Link>
    </Button>
  );
}
