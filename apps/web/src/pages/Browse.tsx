import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/layout/EmptyState';

export function BrowsePage() {
  return (
    <>
      <PageHeader
        eyebrow="MangaDex"
        kanji="探索"
        title="Find the next one."
        subtitle="Search MangaDex by title, author, tag, or language. Official API only — no scraping, no sketchy mirrors."
      />
      <EmptyState
        glyph="探"
        title="Search hasn't started."
        body="Use the search bar at the top, or choose a category. Results stream in as they arrive."
        hint="Coming in v0.1"
      />
    </>
  );
}
