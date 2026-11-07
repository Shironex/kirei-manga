import { Link } from '@tanstack/react-router';
import { LibraryBig } from 'lucide-react';

import { EmptyState } from '@/components/page/EmptyState';
import { PageHeader } from '@/components/page/PageHeader';
import { Button } from '@/components/ui/button';

export function BrowsePage() {
  return (
    <>
      <PageHeader
        title="Browse"
        lead="Search MangaDex, follow series and get new chapters in your language first."
      />
      <EmptyState
        title="Online sources arrive in 1.1"
        actions={
          <Button variant="ghost" asChild>
            <Link to="/library">
              <LibraryBig /> Go to your library
            </Link>
          </Button>
        }
      >
        <p>
          Browsing and following MangaDex is the next release. Your local library works fully
          offline until then.
        </p>
      </EmptyState>
    </>
  );
}
