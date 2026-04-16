import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LocalEvents,
  type Chapter,
  type LocalDeleteSeriesPayload,
  type LocalDeleteSeriesResponse,
  type LocalGetSeriesPayload,
  type LocalGetSeriesResponse,
  type Series,
  createLogger,
} from '@kireimanga/shared';
import { EmptyState } from '../components/layout/EmptyState';
import { LocalMetadataDrawer } from '../components/local/LocalMetadataDrawer';
import { emitWithResponse } from '@/lib/socket';
import { useToastStore } from '@/stores/toast-store';

const logger = createLogger('LocalSeriesDetail');

/**
 * Format a chapter list row's numeric columns. Folders without a parsed
 * chapter number get a long dash so the column stays aligned — Slice J's
 * inline editor is where the user corrects mis-parses.
 */
function formatChapterLabel(chapter: Chapter): string {
  const parts: string[] = [];
  if (chapter.volumeNumber) parts.push(`V${chapter.volumeNumber}`);
  parts.push(chapter.chapterNumber ? `Ch ${chapter.chapterNumber}` : 'Ch —');
  return parts.join(' · ');
}

export function LocalSeriesDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const pushToast = useToastStore(s => s.show);
  const [series, setSeries] = useState<Series | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coverLoaded, setCoverLoaded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    emitWithResponse<LocalGetSeriesPayload, LocalGetSeriesResponse>(
      LocalEvents.GET_SERIES,
      { id }
    )
      .then(response => {
        if (cancelled) return;
        if (response.error) {
          setError(response.error);
          setLoading(false);
          return;
        }
        setSeries(response.series);
        setChapters(response.chapters);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        logger.error('local:get-series failed', message);
        setError(message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleDelete = async (): Promise<void> => {
    if (!series || deleting) return;
    const confirmed = window.confirm(
      `Remove "${series.title}" from the library? The files on disk aren't deleted.`
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      const response = await emitWithResponse<
        LocalDeleteSeriesPayload,
        LocalDeleteSeriesResponse
      >(LocalEvents.DELETE_SERIES, { id: series.id });
      if (response.error || !response.success) {
        throw new Error(response.error ?? 'local:delete-series returned success=false');
      }
      pushToast({
        variant: 'success',
        title: 'Removed',
        body: `${series.title} removed from the library.`,
      });
      navigate('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushToast({
        variant: 'error',
        title: 'Remove failed',
        body: message,
      });
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-8 md:flex-row md:gap-10">
        <div className="skeleton-pulse aspect-[2/3] w-full max-w-[280px] shrink-0 rounded-[2px] bg-[var(--color-ink-raised)]" />
        <div className="flex flex-1 flex-col gap-4 pt-4">
          <div className="skeleton-pulse h-px w-full bg-border" />
          <div className="skeleton-pulse h-px w-full bg-border" />
          <div className="skeleton-pulse h-px w-full bg-border" />
        </div>
      </div>
    );
  }

  if (error || !series) {
    return (
      <EmptyState
        glyph="空"
        title="Series not found."
        body={error ?? 'The requested series is not in your local library.'}
        action={
          <Link
            to="/"
            className="inline-flex h-9 items-center rounded-[2px] border border-border px-4 font-mono text-[11px] tracking-[0.22em] text-foreground uppercase transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            Back to library
          </Link>
        }
      />
    );
  }

  const continueChapterId = series.lastChapterId;
  const readCount = chapters.filter(c => c.isRead).length;

  return (
    <>
      <section className="flex flex-col gap-8 md:flex-row md:items-start md:gap-10">
        <div className="relative aspect-[2/3] w-full max-w-[280px] shrink-0 overflow-hidden rounded-[2px] bg-[var(--color-ink-sunken)]">
          {series.coverPath ? (
            <img
              src={series.coverPath}
              alt=""
              onLoad={() => setCoverLoaded(true)}
              className={[
                'h-full w-full object-cover transition-opacity duration-500 ease-[var(--ease-out-quart)]',
                coverLoaded ? 'opacity-100' : 'opacity-0',
              ].join(' ')}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <span className="font-kanji text-[48px] text-[var(--color-bone-faint)] opacity-50">
                書
              </span>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-mono text-[10px] tracking-[0.26em] text-[var(--color-bone-faint)] uppercase">
            Local · Series
          </span>
          <h1 className="font-display mt-3 text-[40px] leading-[1.05] font-medium text-foreground">
            {series.title}
          </h1>
          {series.titleJapanese && (
            <p className="font-kanji mt-2 text-[15px] text-[var(--color-bone-muted)]">
              {series.titleJapanese}
            </p>
          )}

          <dl className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-[10.5px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
            <div className="flex items-baseline gap-2">
              <dt>Chapters</dt>
              <dd className="text-foreground">{chapters.length}</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt>Read</dt>
              <dd className="text-foreground">{readCount}</dd>
            </div>
            {series.localRootPath && (
              <div className="flex min-w-0 items-baseline gap-2">
                <dt>Root</dt>
                <dd className="truncate text-[var(--color-bone-muted)] normal-case">
                  {series.localRootPath}
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {continueChapterId && (
              <Link
                to={`/reader/local/${series.id}/${continueChapterId}`}
                className="inline-flex h-9 items-center rounded-[2px] border border-[var(--color-accent)] bg-[var(--color-accent)] px-5 font-mono text-[11px] tracking-[0.22em] text-[var(--color-accent-foreground)] uppercase transition-opacity hover:opacity-90"
              >
                Continue
              </Link>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex h-9 items-center rounded-[2px] border border-border px-4 font-mono text-[11px] tracking-[0.22em] text-foreground uppercase transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="inline-flex h-9 items-center rounded-[2px] border border-border px-4 font-mono text-[11px] tracking-[0.22em] text-[var(--color-bone-muted)] uppercase transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:cursor-wait disabled:opacity-60"
            >
              {deleting ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      </section>

      <LocalMetadataDrawer
        open={editing}
        onClose={() => setEditing(false)}
        series={series}
        onSaved={updated => setSeries(updated)}
      />

      <section className="mt-12 animate-fade-up">
        <div className="mb-4 flex items-baseline justify-between border-b border-[var(--color-rule)] pb-3">
          <span className="font-mono text-[10px] tracking-[0.26em] text-[var(--color-bone-faint)] uppercase">
            Chapters
          </span>
          <span className="font-mono text-[10.5px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
            {readCount} / {chapters.length} read
          </span>
        </div>
        <ul className="flex flex-col divide-y divide-[var(--color-rule)]">
          {chapters.map(chapter => {
            const isInProgress =
              !chapter.isRead && chapter.lastReadPage > 0 && chapter.pageCount > 0;
            return (
              <li key={chapter.id}>
                <Link
                  to={`/reader/local/${series.id}/${chapter.id}`}
                  state={{
                    chapter: {
                      chapterNumber: chapter.chapterNumber,
                      volumeNumber: chapter.volumeNumber,
                      title: chapter.title,
                    },
                  }}
                  className="group flex items-baseline justify-between gap-4 py-3 transition-colors"
                >
                  <span
                    className={[
                      'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                      chapter.isRead
                        ? 'bg-[var(--color-rule-strong)]'
                        : isInProgress
                          ? 'bg-[var(--color-accent)]/60'
                          : 'bg-[var(--color-accent)]',
                    ].join(' ')}
                    aria-label={
                      chapter.isRead ? 'Read' : isInProgress ? 'In progress' : 'Unread'
                    }
                  />
                  <span className="w-32 shrink-0 font-mono text-[10.5px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
                    {formatChapterLabel(chapter)}
                  </span>
                  <span
                    className={[
                      'font-display min-w-0 flex-1 truncate text-[14px] transition-[font-style,color]',
                      chapter.isRead
                        ? 'text-[var(--color-bone-muted)]'
                        : 'text-foreground italic group-hover:not-italic group-hover:text-[var(--color-accent)]',
                    ].join(' ')}
                  >
                    {chapter.title ?? `Chapter ${chapter.chapterNumber}`}
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
                    {isInProgress
                      ? `${chapter.lastReadPage + 1} / ${chapter.pageCount}`
                      : `${chapter.pageCount} pp`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
