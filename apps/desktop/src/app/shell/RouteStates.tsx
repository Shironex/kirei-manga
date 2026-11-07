import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { LibraryBig, RotateCw } from 'lucide-react';

import { EmptyState } from '@/components/page/EmptyState';
import { PageHeader } from '@/components/page/PageHeader';
import { Button } from '@/components/ui/button';

import { ShellFrame } from './AppShell';

/** Shown in place of a route that threw while loading or rendering. The rail stays usable. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const message = error instanceof Error ? error.message : String(error);
  return (
    <EmptyState
      tone="alert"
      title="This screen ran into a problem"
      actions={
        <>
          <Button
            variant="primary"
            onClick={() => {
              reset();
              void router.invalidate();
            }}
          >
            <RotateCw /> Try again
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/library">
              <LibraryBig /> Library
            </Link>
          </Button>
        </>
      }
    >
      <p>Nothing was lost. The rest of the app still works.</p>
      <code className="mt-3 block rounded-lg border border-line bg-ink-1 px-3 py-2 font-mono text-xs break-words text-fg-2">
        {message}
      </code>
    </EmptyState>
  );
}

/** Loading placeholder shaped like a page: title, lead and a row of covers. */
export function RoutePending() {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid gap-8">
      <div className="grid gap-3">
        <div className="h-9 w-56 animate-shimmer rounded-lg bg-[linear-gradient(100deg,var(--ink-2)_30%,var(--ink-3)_50%,var(--ink-2)_70%)] bg-[length:300%_100%]" />
        <div className="h-3 w-96 animate-shimmer rounded bg-[linear-gradient(100deg,var(--ink-2)_30%,var(--ink-3)_50%,var(--ink-2)_70%)] bg-[length:300%_100%]" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-6 gap-y-8">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="aspect-[2/3] animate-shimmer rounded-cover bg-[linear-gradient(100deg,var(--ink-2)_30%,var(--ink-3)_50%,var(--ink-2)_70%)] bg-[length:300%_100%]"
          />
        ))}
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <>
      <PageHeader title="Not found" />
      <EmptyState
        title="There is nothing at this address"
        actions={
          <Button variant="primary" asChild>
            <Link to="/library">
              <LibraryBig /> Back to the library
            </Link>
          </Button>
        }
      >
        <p>The link may be from an older version of KireiManga.</p>
      </EmptyState>
    </>
  );
}

/** Unknown addresses still get the rail, so the way back is obvious. */
export function ShellNotFound() {
  return (
    <ShellFrame>
      <NotFound />
    </ShellFrame>
  );
}
