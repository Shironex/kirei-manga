import { Link } from '@tanstack/react-router';

import { PageHeader } from '@/components/page/PageHeader';
import { FollowingView } from '@/features/online/FollowingView';
import { MangaDexCredit, OnlineStatus } from '@/features/online/OnlineStatus';
import { SearchView } from '@/features/online/SearchView';
import { UpdatesView } from '@/features/online/UpdatesView';
import { cn } from '@/lib/utils';

type BrowseTab = 'search' | 'updates' | 'following';

const TABS = [
  { tab: 'search', to: '/browse', label: 'Search' },
  { tab: 'updates', to: '/browse/updates', label: 'Updates' },
  { tab: 'following', to: '/browse/following', label: 'Following' },
] as const;

/** Browse: search MangaDex, the updates feed and followed series, one tab each. */
function BrowsePage({ tab }: { tab: BrowseTab }) {
  return (
    <>
      <PageHeader
        title="Browse"
        lead="Search MangaDex, follow series and get new chapters in your language first."
      />
      <OnlineStatus />
      <nav aria-label="Browse" className="mb-6 flex gap-0.5">
        {TABS.map(item => (
          <Link
            key={item.tab}
            to={item.to}
            aria-current={item.tab === tab ? 'page' : undefined}
            activeOptions={{ exact: true }}
            className={cn(
              'rounded-lg px-3 py-2 text-sm whitespace-nowrap text-fg-2 no-underline',
              'transition-[background-color,color] duration-base ease-expo hover:bg-ink-2 hover:text-fg-1',
              'aria-[current=page]:bg-ink-2 aria-[current=page]:text-fg-1'
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {tab === 'search' && <SearchView />}
      {tab === 'updates' && <UpdatesView />}
      {tab === 'following' && <FollowingView />}
      <MangaDexCredit className="mt-10" />
    </>
  );
}

export const BrowseSearchPage = () => <BrowsePage tab="search" />;
export const BrowseUpdatesPage = () => <BrowsePage tab="updates" />;
export const BrowseFollowingPage = () => <BrowsePage tab="following" />;
