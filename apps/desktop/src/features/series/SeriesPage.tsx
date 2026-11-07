import { getRouteApi, Link } from '@tanstack/react-router';
import { ArrowLeft, LibraryBig } from 'lucide-react';

import { EmptyState } from '@/components/page/EmptyState';
import { PageHeader } from '@/components/page/PageHeader';
import { Button } from '@/components/ui/button';

const route = getRouteApi('/shell/series/$seriesId');

export function SeriesPage() {
  const { seriesId } = route.useParams();
  return (
    <>
      <Link
        to="/library"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-2 no-underline transition-colors duration-base hover:text-fg-1"
      >
        <ArrowLeft className="size-4" aria-hidden /> Library
      </Link>
      <PageHeader title="Missing series" />
      <EmptyState
        title="This series is not in your library"
        actions={
          <Button variant="primary" asChild>
            <Link to="/library">
              <LibraryBig /> Back to the library
            </Link>
          </Button>
        }
      >
        <p>
          Nothing is filed under <code className="font-mono text-sm text-fg-1">{seriesId}</code>. It
          may have been removed, or its folder moved since the last scan.
        </p>
      </EmptyState>
    </>
  );
}
