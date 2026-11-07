import { Link } from '@tanstack/react-router';
import { Compass } from 'lucide-react';

import { EmptyState } from '@/components/page/EmptyState';
import { PageHeader } from '@/components/page/PageHeader';
import { Button } from '@/components/ui/button';

export function DownloadsPage() {
  return (
    <>
      <PageHeader
        title="Downloads"
        lead="Chapters are written as CBZ archives with ComicInfo.xml, so they open in any reader and survive without KireiManga."
      />
      <EmptyState
        title="Nothing downloading"
        actions={
          <Button variant="ghost" asChild>
            <Link to="/browse">
              <Compass /> Browse
            </Link>
          </Button>
        }
      >
        <p>
          Chapters you download from Browse queue up here, then join your library like any other
          folder.
        </p>
      </EmptyState>
    </>
  );
}
