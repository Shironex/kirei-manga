import { FolderPlus } from 'lucide-react';

import { EmptyState } from '@/components/page/EmptyState';
import { PageHeader } from '@/components/page/PageHeader';
import { Button } from '@/components/ui/button';

export function LibraryPage() {
  return (
    <>
      <PageHeader
        title="Library"
        lead="Your manga, read in place from the folders you choose. Nothing is copied or converted."
      />
      <EmptyState
        title="Your shelf is empty"
        actions={
          <>
            <Button variant="primary" disabled aria-describedby="library-soon">
              <FolderPlus /> Add a folder
            </Button>
            <span id="library-soon" className="text-sm text-fg-3">
              Folder scanning is on its way.
            </span>
          </>
        }
      >
        <p>
          Point KireiManga at a folder of CBZ or CBR archives, or folders of images, and every
          series in it shows up here with its cover.
        </p>
      </EmptyState>
    </>
  );
}
