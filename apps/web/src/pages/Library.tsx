import type { Series } from '@kireimanga/shared';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/layout/EmptyState';
import { LibraryGrid } from '../components/library/LibraryGrid';
import { LibraryList } from '../components/library/LibraryList';
import { LibraryControls } from '../components/library/LibraryControls';
import { useLibraryStore } from '@/stores/library-store';
import { useLibraryViewStore, type LibrarySort } from '@/stores/library-view-store';
import { fuzzyIncludes } from '@/lib/fuzzyMatch';
import { useT } from '@/hooks/useT';

function toTime(value: Date | string | undefined): number {
  if (!value) return 0;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function compareSeries(a: Series, b: Series, sort: LibrarySort): number {
  switch (sort) {
    case 'title':
      return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
    case 'lastRead':
      return toTime(a.lastReadAt) - toTime(b.lastReadAt);
    case 'dateAdded':
      return toTime(a.addedAt) - toTime(b.addedAt);
    case 'progress':
      // TODO(slice-e): sort by progress
      return 0;
  }
}

export function LibraryPage() {
  const t = useT();
  const series = useLibraryStore(s => s.series);
  const mode = useLibraryViewStore(s => s.mode);
  const sort = useLibraryViewStore(s => s.sort);
  const sortDir = useLibraryViewStore(s => s.sortDir);
  const statusFilter = useLibraryViewStore(s => s.statusFilter);
  const query = useLibraryViewStore(s => s.query);

  // Drop optimistic rows (empty title + pending: prefix). MangaDex rows
  // need a mangadexId to route; local rows route by local id, no mangadex
  // id required.
  const baseVisible = series.filter(s => {
    if (s.id.startsWith('pending:')) return false;
    if (s.source === 'local') return true;
    return s.source === 'mangadex' && !!s.mangadexId;
  });

  const statusFiltered =
    statusFilter === 'all'
      ? baseVisible
      : baseVisible.filter(s => s.status === statusFilter);

  const searched = query
    ? statusFiltered.filter(s =>
        fuzzyIncludes(`${s.title} ${s.titleJapanese ?? ''}`, query)
      )
    : statusFiltered;

  const sign = sortDir === 'asc' ? 1 : -1;
  const visible = [...searched].sort((a, b) => sign * compareSeries(a, b, sort));

  const totalCount = baseVisible.length;
  const visibleCount = visible.length;

  return (
    <>
      <PageHeader
        eyebrow={t('library.eyebrow')}
        kanji="書架"
        title={t('library.title')}
        subtitle={
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase">
            {t('library.subtitle.count', { count: totalCount })}
          </span>
        }
      />
      {totalCount === 0 ? (
        <EmptyState
          glyph="書"
          title={t('library.empty.title')}
          body={t('library.empty.body')}
          action={
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/browse"
                className="inline-flex h-9 items-center rounded-[2px] border border-border px-4 font-mono text-[11px] tracking-[0.22em] text-foreground uppercase transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                {t('library.empty.cta')}
              </Link>
              <Link
                to="/library/import"
                className="inline-flex h-9 items-center rounded-[2px] border border-border px-4 font-mono text-[11px] tracking-[0.22em] text-foreground uppercase transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                {t('library.empty.cta.import')}
              </Link>
            </div>
          }
          hint={t('library.empty.hint')}
        />
      ) : (
        <>
          <LibraryControls />
          {visibleCount === 0 ? (
            <p className="py-10 text-center font-mono text-[11px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
              {t('library.filters.empty')}
            </p>
          ) : mode === 'grid' ? (
            <LibraryGrid series={visible} />
          ) : (
            <LibraryList series={visible} />
          )}
        </>
      )}
    </>
  );
}
