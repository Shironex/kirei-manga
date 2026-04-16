import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  LocalEvents,
  type Chapter,
  type LocalGetSeriesPayload,
  type LocalGetSeriesResponse,
  type Series,
  createLogger,
} from '@kireimanga/shared';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/layout/EmptyState';
import { emitWithResponse } from '@/lib/socket';

const logger = createLogger('LocalSeriesDetail');

/**
 * Placeholder local-series page. Lists the stored chapters so the user can
 * verify the import worked, but the banner / meta drawer / reader link are
 * deliberately left for Slice G — this file exists mainly so the library
 * cards have a real navigation target instead of a dead link.
 */
export function LocalSeriesDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [series, setSeries] = useState<Series | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <p className="py-10 text-center font-mono text-[11px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
        Loading…
      </p>
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

  return (
    <>
      <PageHeader
        eyebrow="Local · Series"
        kanji="書"
        title={series.title}
        subtitle={
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase">
            {chapters.length} chapter{chapters.length === 1 ? '' : 's'}
          </span>
        }
      />

      <div className="animate-fade-up flex flex-col gap-8">
        <p className="max-w-[56ch] text-[13px] leading-relaxed text-[var(--color-bone-muted)]">
          Full detail layout (banner, metadata editor, reader link) lands in
          Slice G. For now you can confirm your import landed correctly.
        </p>

        <div className="flex flex-col divide-y divide-[var(--color-rule)]">
          {chapters.map(chapter => (
            <div
              key={chapter.id}
              className="flex items-baseline justify-between gap-4 py-3"
            >
              <span className="font-mono text-[10.5px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
                {chapter.volumeNumber ? `V${chapter.volumeNumber}` : '—'}
              </span>
              <span className="font-mono text-[10.5px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
                Ch {chapter.chapterNumber || '—'}
              </span>
              <span className="font-display flex-1 text-[14px] text-foreground italic">
                {chapter.title ?? `Chapter ${chapter.chapterNumber}`}
              </span>
              <span className="font-mono text-[10.5px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
                {chapter.pageCount} pp
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
