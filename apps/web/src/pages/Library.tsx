import { Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/layout/EmptyState';

export function LibraryPage() {
  return (
    <>
      <PageHeader
        eyebrow="Library"
        kanji="書架"
        title="Your shelf, quiet and kept."
        subtitle="Follow series from MangaDex or import local archives. Everything you read lives here, offline first."
        actions={
          <button
            type="button"
            className="group inline-flex items-center gap-2 rounded-sm border border-border bg-[var(--color-ink-raised)] px-3.5 py-2 text-[12px] tracking-wide text-foreground transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            <Plus className="h-3.5 w-3.5 stroke-[1.4]" />
            Add series
          </button>
        }
      />
      <EmptyState
        glyph="書"
        title="No series followed yet."
        body="Start by browsing MangaDex to follow a series, or drop a folder of CBZ files into Settings → Local Library."
        hint="Ctrl + B  ·  Browse"
      />
    </>
  );
}
