import { Link } from '@tanstack/react-router';
import { KeyRound } from 'lucide-react';

import { EmptyState } from '@/components/page/EmptyState';
import { Button } from '@/components/ui/button';
import { getFollows } from '@/lib/online';

import { useAccount } from './account';
import { MangaCard, MangaGrid } from './MangaCard';
import { errorText, READING_STATUSES } from './model';
import { useOnlineQuery } from './useOnlineQuery';

function statusLabel(status: string | null): string | undefined {
  return READING_STATUSES.find(s => s.value === status)?.label;
}

/** Series followed on MangaDex, with their reading status. Kept in step by each refresh. */
export function FollowingView() {
  const account = useAccount();
  const signedIn = account.session !== 'signedOut';
  const follows = useOnlineQuery(signedIn ? 'follows' : null, getFollows);

  if (!signedIn) {
    return (
      <EmptyState
        title="Sign in to see what you follow"
        actions={
          <Button variant="primary" asChild>
            <Link to="/settings" search={{ section: 'accounts' }}>
              <KeyRound /> Sign in to MangaDex
            </Link>
          </Button>
        }
      >
        <p>Your MangaDex follows and reading statuses show here once you sign in.</p>
      </EmptyState>
    );
  }
  if (follows.status === 'error' && !follows.data) {
    return (
      <EmptyState
        tone="alert"
        title="Follows did not load"
        actions={
          <Button variant="primary" onClick={follows.reload}>
            Try again
          </Button>
        }
      >
        <p>{errorText(follows.error)}</p>
      </EmptyState>
    );
  }
  if (!follows.data) {
    return (
      <p aria-live="polite" className="text-sm text-fg-3">
        Loading your follows
      </p>
    );
  }
  const shown = follows.data.filter(follow => follow.manga !== null);
  if (shown.length === 0) {
    return (
      <EmptyState title="You follow nothing yet">
        <p>Follow a series from its page and it shows up here, with new chapters in Updates.</p>
      </EmptyState>
    );
  }
  return (
    <MangaGrid label="Followed series">
      {shown.map(follow => (
        <li key={follow.mangaId}>
          <MangaCard manga={follow.manga!} caption={statusLabel(follow.readingStatus)} />
        </li>
      ))}
    </MangaGrid>
  );
}
