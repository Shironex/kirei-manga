import { Link, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LocalEvents,
  type Chapter,
  type LocalDeleteSeriesPayload,
  type LocalDeleteSeriesResponse,
  type LocalGetSeriesPayload,
  type LocalGetSeriesResponse,
  type LocalRescanSeriesPayload,
  type LocalRescanSeriesResponse,
  type Series,
  createLogger,
} from '@kireimanga/shared';
import { EmptyState } from '../components/layout/EmptyState';
import { LocalMetadataDrawer } from '../components/local/LocalMetadataDrawer';
import { emitWithResponse } from '@/lib/socket';
import { useToastStore } from '@/stores/toast-store';
import { useT } from '@/hooks/useT';

const logger = createLogger('LocalSeriesDetail');

/**
 * Format a chapter list row's numeric columns. Folders without a parsed
 * chapter number get a long dash so the column stays aligned — Slice J's
 * inline editor is where the user corrects mis-parses.
 *
 * V/Ch are code-like identifiers (not translated copy). The parse gap emits
 * the bare dash "Ch —" intentionally — same treatment as other row data.
 */
function formatChapterLabel(chapter: Chapter): string {
  const parts: string[] = [];
  if (chapter.volumeNumber) parts.push(`V${chapter.volumeNumber}`);
  parts.push(chapter.chapterNumber ? `Ch ${chapter.chapterNumber}` : 'Ch —');
  return parts.join(' · ');
}

export function LocalSeriesDetailPage() {
  const t = useT();
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
  const [rescanning, setRescanning] = useState(false);

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

  const handleRescan = async (): Promise<void> => {
    if (!series || rescanning) return;
    setRescanning(true);
    try {
      const response = await emitWithResponse<
        LocalRescanSeriesPayload,
        LocalRescanSeriesResponse
      >(LocalEvents.RESCAN_SERIES, { id: series.id });
      if (response.error) {
        throw new Error(response.error);
      }
      if (response.newChapterCount > 0) {
        // Re-fetch so the chapter list picks up the new rows.
        const fresh = await emitWithResponse<LocalGetSeriesPayload, LocalGetSeriesResponse>(
          LocalEvents.GET_SERIES,
          { id: series.id }
        );
        if (fresh.series) setSeries(fresh.series);
        setChapters(fresh.chapters);
        pushToast({
          variant: 'success',
          title: t('series.local.toast.newChaptersTitle'),
          body: t('series.local.toast.newChaptersBody', { count: response.newChapterCount }),
        });
      } else {
        pushToast({
          variant: 'info',
          title: t('series.local.toast.upToDateTitle'),
          body: t('series.local.toast.upToDateBody'),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushToast({
        variant: 'error',
        title: t('series.local.toast.rescanFailed'),
        body: message,
      });
    } finally {
      setRescanning(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!series || deleting) return;
    const confirmed = window.confirm(
      t('series.local.confirm.remove', { title: series.title })
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
        title: t('series.local.toast.removedTitle'),
        body: t('series.local.toast.removedBody', { title: series.title }),
      });
      navigate('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushToast({
        variant: 'error',
        title: t('series.local.toast.removeFailed'),
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
        title={t('series.notFound.title')}
        body={error ?? t('series.notFound.body')}
        action={
          <Link
            to="/"
            className="inline-flex h-9 items-center rounded-[2px] border border-border px-4 font-mono text-[11px] tracking-[0.22em] text-foreground uppercase transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            {t('series.notFound.back')}
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
            {t('series.eyebrow.local')}
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
              <dt>{t('series.local.meta.chapters')}</dt>
              <dd className="text-foreground">{chapters.length}</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt>{t('series.local.meta.read')}</dt>
              <dd className="text-foreground">{readCount}</dd>
            </div>
            {series.mangadexId && (
              <div className="flex items-baseline gap-2">
                <dt>{t('series.local.meta.mangadex')}</dt>
                <dd className="font-kanji text-[var(--color-accent)] normal-case">
                  {t('series.local.meta.mangadex.linked')}
                </dd>
              </div>
            )}
            {series.localRootPath && (
              <div className="flex min-w-0 items-baseline gap-2">
                <dt>{t('series.local.meta.root')}</dt>
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
                {t('series.continue')}
              </Link>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex h-9 items-center rounded-[2px] border border-border px-4 font-mono text-[11px] tracking-[0.22em] text-foreground uppercase transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              {t('series.local.action.edit')}
            </button>
            <button
              type="button"
              onClick={() => void handleRescan()}
              disabled={rescanning}
              className="inline-flex h-9 items-center rounded-[2px] border border-border px-4 font-mono text-[11px] tracking-[0.22em] text-[var(--color-bone-muted)] uppercase transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:cursor-wait disabled:opacity-60"
            >
              {rescanning ? t('series.local.action.rescanning') : t('series.local.action.rescan')}
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="inline-flex h-9 items-center rounded-[2px] border border-border px-4 font-mono text-[11px] tracking-[0.22em] text-[var(--color-bone-muted)] uppercase transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:cursor-wait disabled:opacity-60"
            >
              {deleting ? t('series.local.action.removing') : t('series.local.action.remove')}
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
            {t('series.chapters')}
          </span>
          <span className="font-mono text-[10.5px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
            {t('series.local.chapters.readOfTotal', {
              read: readCount,
              total: chapters.length,
            })}
          </span>
        </div>
        <ul className="flex flex-col divide-y divide-[var(--color-rule)]">
          {chapters.map(chapter => {
            const isInProgress =
              !chapter.isRead && chapter.lastReadPage > 0 && chapter.pageCount > 0;
            const statusAria = chapter.isRead
              ? t('series.local.chapters.read')
              : isInProgress
                ? t('series.local.chapters.inProgress')
                : t('series.local.chapters.unread');
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
                    aria-label={statusAria}
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
                    {chapter.title ??
                      t('series.local.chapters.fallbackTitle', {
                        number: chapter.chapterNumber ?? '—',
                      })}
                  </span>
                  <span className="shrink-0 font-mono text-[10.5px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
                    {isInProgress
                      ? t('series.local.chapters.pageProgress', {
                          current: chapter.lastReadPage + 1,
                          total: chapter.pageCount,
                        })
                      : t('series.local.chapters.pageCount', { count: chapter.pageCount })}
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
