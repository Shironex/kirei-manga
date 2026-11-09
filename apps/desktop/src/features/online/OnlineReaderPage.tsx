import { useCallback, useEffect, useState } from 'react';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { prefsFromAppSettings } from '@/features/reader/model/prefs';
import { Reader } from '@/features/reader/Reader';
import { ReaderMessage } from '@/features/reader/ReaderPage';
import type { LoadedChapter } from '@/features/reader/useChapter';
import { isTauri } from '@/lib/ipc';
import {
  openMangaDex,
  openOnlineChapter,
  recordOnlineProgress,
  toOnlineError,
  type OnlineError,
} from '@/lib/online';
import { closeSource, pageMeta } from '@/lib/reader';
import { useSettings } from '@/lib/settings/store';

import { chapterLabel, creditLine, errorText, mangaTitle } from './model';

const route = getRouteApi('/read/online/$mangaId/$chapterId');

type State =
  | { status: 'loading' }
  | { status: 'ready'; chapter: LoadedChapter; nextId: string | null }
  | { status: 'error'; error: OnlineError };

/**
 * Opens a MangaDex chapter as a reader source. Pages come through the same
 * pipeline as an archive (fetched in Rust from MangaDex@Home, reported back,
 * cached, read ahead), never hotlinked.
 */
async function load(
  mangaId: string,
  chapterId: string,
  chain: readonly string[]
): Promise<{ chapter: LoadedChapter; nextId: string | null }> {
  const opened = await openOnlineChapter(mangaId, chapterId);
  const meta = await pageMeta(opened.id);
  const label = chapterLabel(opened.chapter);
  const named = opened.chapter.title && opened.chapter.chapter ? `, ${opened.chapter.title}` : '';
  return {
    chapter: {
      source: { id: opened.id, kind: 'online', pages: opened.pages, openMs: 0 },
      pages: meta.pages,
      title: mangaTitle(opened.manga, chain),
      subtitle: `${label}${named} · ${creditLine(opened.chapter)} · via MangaDex`,
      label,
      seriesId: null,
      chapterId: null,
      startPage: Math.min(opened.startPage, Math.max(0, opened.pages.length - 1)),
      manga: null,
      settings: null,
      cover: null,
      next: opened.next ? { label: chapterLabel(opened.next), title: opened.next.title } : null,
    },
    nextId: opened.next?.id ?? null,
  };
}

/** `/read/online/$mangaId/$chapterId`: a MangaDex chapter in the reader. */
export function OnlineReaderPage() {
  const { mangaId, chapterId } = route.useParams();
  const settings = useSettings();
  const settingsReady = settings.loaded || settings.error !== null || !isTauri();
  const chain = settings.settings['online.languages'];
  const navigate = useNavigate();
  const [state, setState] = useState<{ key: string; value: State }>({
    key: chapterId,
    value: { status: 'loading' },
  });

  useEffect(() => {
    let alive = true;
    let opened: number | null = null;
    load(mangaId, chapterId, chain).then(
      result => {
        opened = result.chapter.source.id;
        if (alive) setState({ key: chapterId, value: { status: 'ready', ...result } });
        else void closeSource(opened);
      },
      (error: unknown) => {
        if (alive)
          setState({ key: chapterId, value: { status: 'error', error: toOnlineError(error) } });
      }
    );
    return () => {
      alive = false;
      if (opened !== null) void closeSource(opened);
    };
    // The chain only changes the title; a new language list does not reopen the chapter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mangaId, chapterId]);

  const current: State = state.key === chapterId ? state.value : { status: 'loading' };

  const readyTitle = current.status === 'ready' ? current.chapter.title : null;
  const pageCount = current.status === 'ready' ? current.chapter.pages.length : 0;
  useEffect(() => {
    document.title = readyTitle ? `${readyTitle} - KireiManga` : 'Reader - KireiManga';
  }, [readyTitle]);

  const close = useCallback(() => {
    void navigate({ to: '/online/$mangaId', params: { mangaId } });
  }, [navigate, mangaId]);

  const report = useCallback(
    (page: number) =>
      recordOnlineProgress(mangaId, chapterId, page, pageCount > 0 && page >= pageCount - 1),
    [pageCount, mangaId, chapterId]
  );

  if (current.status === 'loading' || !settingsReady) {
    return <ReaderMessage loading onClose={close} />;
  }
  if (current.status === 'error') {
    const external = current.error.kind === 'external';
    return (
      <ReaderMessage
        title={
          external ? 'This chapter is read on the publisher site' : 'This chapter did not open'
        }
        alert={!external}
        onClose={close}
        actions={
          <>
            <Button
              variant={external ? 'primary' : 'ghost'}
              onClick={() => void openMangaDex({ kind: 'chapter', id: chapterId })}
            >
              <ExternalLink /> Open on MangaDex
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/online/$mangaId" params={{ mangaId }}>
                <ArrowLeft /> Back to the series
              </Link>
            </Button>
          </>
        }
      >
        <p>
          {external
            ? 'MangaDex links this chapter to an official release, so it opens in your browser.'
            : errorText(current.error)}
        </p>
      </ReaderMessage>
    );
  }

  const { chapter, nextId } = current;
  return (
    <Reader
      key={chapter.source.id}
      chapter={chapter}
      defaults={prefsFromAppSettings(settings.settings)}
      defaultFilter={settings.settings['reader.filter']}
      onClose={close}
      onNextChapter={() => {
        if (nextId)
          void navigate({
            to: '/read/online/$mangaId/$chapterId',
            params: { mangaId, chapterId: nextId },
            replace: true,
          });
      }}
      progressReport={{ key: chapterId, report }}
      lastNote="That was the latest chapter in your languages on MangaDex."
    />
  );
}
