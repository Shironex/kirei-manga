import { useEffect } from 'react';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, LibraryBig } from 'lucide-react';

import { EmptyState } from '@/components/page/EmptyState';
import { Button } from '@/components/ui/button';
import { Kbd, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const route = getRouteApi('/read/$seriesId/$chapterId');

/**
 * Full-window reader frame: stage, glass top bar, Esc to leave. Pages, modes
 * and the adjust panel land with the reader slices (#28, #29).
 */
export function ReaderPage() {
  const { seriesId, chapterId } = route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Reader - KireiManga';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        void navigate({ to: '/library' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <div className="fixed inset-0 grid grid-rows-[auto_minmax(0,1fr)] bg-[radial-gradient(70%_80%_at_50%_45%,oklch(0.17_calc(var(--accent-c)*0.35)_var(--seed-h)),var(--ink-stage)_75%)]">
      <header
        data-tauri-drag-region
        className="glass m-3 flex items-center gap-3 rounded-2xl p-2 [:root[data-chrome=overlay]_&]:pl-[84px]"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="quiet" size="icon" aria-label="Back to the library" asChild>
              <Link to="/library">
                <ArrowLeft />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Back <Kbd>Esc</Kbd>
          </TooltipContent>
        </Tooltip>
        <div className="grid min-w-0 leading-tight">
          <strong className="truncate font-semibold">Nothing open</strong>
          <span className="truncate text-xs text-fg-3">
            {seriesId}, chapter {chapterId}
          </span>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="grid place-items-center px-6 outline-none">
        <EmptyState
          title="This chapter is not on your shelf"
          actions={
            <Button variant="primary" asChild>
              <Link to="/library">
                <LibraryBig /> Open the library
              </Link>
            </Button>
          }
        >
          <p>Pick a chapter from your library and it opens here, full window.</p>
        </EmptyState>
      </main>
    </div>
  );
}
