import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/layout/EmptyState';
import { LibraryGrid } from '../components/library/LibraryGrid';
import { useLibraryStore } from '@/stores/library-store';

export function LibraryPage() {
  const series = useLibraryStore(s => s.series);

  // Drop optimistic rows (empty title + pending: prefix) and non-mangadex
  // entries — v0.1 only surfaces mangadex-sourced series.
  // TODO(slice-f): local series
  const visible = series.filter(
    s => !s.id.startsWith('pending:') && s.source === 'mangadex' && !!s.mangadexId
  );

  const count = visible.length;

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
        <LibraryGrid series={visible} />
      )}
    </>
  );
}
