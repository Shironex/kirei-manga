import type { Series } from '@kireimanga/shared';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/layout/EmptyState';
import { LibraryGrid } from '../components/library/LibraryGrid';
import { LibraryList } from '../components/library/LibraryList';
import { LibraryControls } from '../components/library/LibraryControls';
import { useLibraryStore } from '@/stores/library-store';
import { useLibraryViewStore, type LibrarySort } from '@/stores/library-view-store';

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
  const series = useLibraryStore(s => s.series);
  const mode = useLibraryViewStore(s => s.mode);
  const sort = useLibraryViewStore(s => s.sort);
  const sortDir = useLibraryViewStore(s => s.sortDir);
  const statusFilter = useLibraryViewStore(s => s.statusFilter);

  // Drop optimistic rows (empty title + pending: prefix) and non-mangadex
  // entries — v0.1 only surfaces mangadex-sourced series.
  // TODO(slice-f): local series
  const baseVisible = series.filter(
    s => !s.id.startsWith('pending:') && s.source === 'mangadex' && !!s.mangadexId
  );

  const filtered =
    statusFilter === 'all'
      ? baseVisible
      : baseVisible.filter(s => s.status === statusFilter);

  const sign = sortDir === 'asc' ? 1 : -1;
  const visible = [...filtered].sort((a, b) => sign * compareSeries(a, b, sort));

  const count = baseVisible.length;

  return (
    <>
      <PageHeader
        eyebrow="Library"
        kanji="書架"
        title="Your shelf, quiet and kept."
        subtitle={
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase">
            {count} series
          </span>
        }
      />
      {count === 0 ? (
        <EmptyState
          glyph="書"
          title="No series followed yet."
          body="Start by browsing MangaDex to follow a series, or drop a folder of CBZ files into Settings → Local Library."
          hint="Ctrl + B  ·  Browse"
        />
      ) : (
        <>
          <LibraryControls />
          {mode === 'grid' ? <LibraryGrid series={visible} /> : <LibraryList series={visible} />}
        </>
      )}
    </>
  );
}
