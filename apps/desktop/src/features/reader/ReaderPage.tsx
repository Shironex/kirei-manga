import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { ArrowLeft, FileArchive, FolderOpen, LibraryBig } from 'lucide-react';

import { EmptyState } from '@/components/page/EmptyState';
import { Button } from '@/components/ui/button';
import { isTauri } from '@/lib/ipc';
import { useSettings } from '@/lib/settings/store';
import { useChapterCover } from '@/lib/theme/coverTheme';
import { cn } from '@/lib/utils';

import { Tip } from './chrome/Tip';
import { resolveBindings } from './model/keys';
import { prefsFromAppSettings } from './model/prefs';
import { useOpenChapter, type ChapterTarget } from './openChapter';
import { Reader } from './Reader';
import { READER_STAGE } from './stage';
import { useChapter } from './useChapter';

const libraryRoute = getRouteApi('/read/$seriesId/$chapterId');
const fileRoute = getRouteApi('/read/file');

const ARCHIVE_FILTER = { name: 'Comic archives', extensions: ['cbz', 'zip', 'cbr', 'rar'] };

/** `/read/$seriesId/$chapterId`: a chapter of a library series. */
export function LibraryReaderPage() {
  const { seriesId, chapterId } = libraryRoute.useParams();
  const { page } = libraryRoute.useSearch();
  const series = Number(seriesId);
  const chapter = Number(chapterId);
  if (!Number.isInteger(series) || !Number.isInteger(chapter)) {
    return <ReaderMessage title="This chapter is not on your shelf" />;
  }
  return <ReaderScreen target={{ kind: 'library', seriesId: series, chapterId: chapter, page }} />;
}

/** `/read/file?path=`: an archive or folder opened from disk. */
export function FileReaderPage() {
  const { path, page } = fileRoute.useSearch();
  if (!path) return <ReaderMessage title="Open a chapter to read" />;
  return <ReaderScreen target={{ kind: 'file', path, page }} />;
}

/** Asks for an archive or a folder and opens it in the reader. */
function useOpenFile(): (directory?: boolean) => Promise<void> {
  const openChapter = useOpenChapter();
  return useCallback(
    async (directory = false) => {
      const picked = await openDialog(
        directory ? { directory: true } : { multiple: false, filters: [ARCHIVE_FILTER] }
      );
      if (typeof picked === 'string')
        openChapter({ kind: 'file', path: picked }, { replace: true });
    },
    [openChapter]
  );
}

function ReaderScreen({ target }: { target: ChapterTarget }) {
  const state = useChapter(target);
  useChapterCover(state.status === 'ready' ? state.chapter.cover : undefined);
  const settings = useSettings();
  // Defaults come from the stored app settings, so wait for them (outside
  // Tauri, or when they cannot be read, the built-in defaults apply).
  const settingsReady = settings.loaded || settings.error !== null || !isTauri();
  const navigate = useNavigate();
  const openChapter = useOpenChapter();
  const openFile = useOpenFile();
  const { settings: app } = settings;
  const storedKeys = app['reader.keys'];
  const bindings = useMemo(() => resolveBindings(storedKeys), [storedKeys]);
  const options = useMemo(
    () => ({
      detectWebtoon: app['reader.detectWebtoon'],
      splitTall: app['reader.splitTall'],
      bindings,
    }),
    [app, bindings]
  );

  useEffect(() => {
    document.title =
      state.status === 'ready' ? `${state.chapter.title} - KireiManga` : 'Reader - KireiManga';
  }, [state]);

  const close = useCallback(() => {
    if (target.kind === 'library') {
      void navigate({ to: '/series/$seriesId', params: { seriesId: String(target.seriesId) } });
    } else {
      void navigate({ to: '/library' });
    }
  }, [navigate, target]);

  if (state.status === 'loading' || !settingsReady) return <ReaderMessage loading />;
  if (state.status === 'error') {
    return (
      <ReaderMessage title="This chapter did not open" alert onClose={close}>
        <p>{state.message}</p>
      </ReaderMessage>
    );
  }

  const { chapter } = state;
  const next = chapter.next;
  return (
    <Reader
      key={chapter.source.id}
      chapter={chapter}
      defaults={prefsFromAppSettings(settings.settings)}
      options={options}
      defaultFilter={settings.settings['reader.filter']}
      onClose={close}
      onNextChapter={() => {
        if (next)
          openChapter(
            { kind: 'library', seriesId: next.seriesId, chapterId: next.chapterId, page: 0 },
            { replace: true }
          );
      }}
      onOpenFile={target.kind === 'file' && isTauri() ? () => void openFile() : undefined}
    />
  );
}

/**
 * The reader frame without a chapter: loading, an error or nothing chosen.
 * Esc and the back button leave, like in the reader.
 */
function ReaderMessage({
  title,
  loading = false,
  alert = false,
  onClose,
  children,
}: {
  title?: string;
  loading?: boolean;
  alert?: boolean;
  onClose?: () => void;
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  const openFile = useOpenFile();
  const leave = useCallback(() => {
    if (onClose) onClose();
    else void navigate({ to: '/library' });
  }, [onClose, navigate]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) leave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [leave]);

  return (
    <div
      role="dialog"
      aria-label="Reader"
      aria-busy={loading}
      className={cn(READER_STAGE, 'grid grid-rows-[auto_minmax(0,1fr)]')}
    >
      <header
        data-tauri-drag-region
        className="glass m-3 flex items-center gap-3 rounded-2xl p-2 [:root[data-chrome=overlay]_&]:pl-[84px]"
      >
        <Tip label="Close" keys="Esc">
          <Button variant="ghost" size="icon" aria-label="Close reader" onClick={leave}>
            <ArrowLeft />
          </Button>
        </Tip>
        <strong className="truncate font-semibold">{loading ? 'Opening' : 'Reader'}</strong>
      </header>
      <main id="main" tabIndex={-1} className="grid place-items-center px-6 outline-none">
        {loading ? (
          <span className="sr-only">Opening the chapter</span>
        ) : (
          <EmptyState
            title={title ?? 'Reader'}
            tone={alert ? 'alert' : 'calm'}
            actions={
              <>
                {isTauri() && (
                  <>
                    <Button variant="primary" onClick={() => void openFile()}>
                      <FileArchive /> Open an archive
                    </Button>
                    <Button variant="ghost" onClick={() => void openFile(true)}>
                      <FolderOpen /> Open a folder
                    </Button>
                  </>
                )}
                <Button variant="ghost" asChild>
                  <Link to="/library">
                    <LibraryBig /> Library
                  </Link>
                </Button>
              </>
            }
          >
            {children ?? <p>Pick a chapter from your library, or open a CBZ, CBR or folder.</p>}
          </EmptyState>
        )}
      </main>
    </div>
  );
}
