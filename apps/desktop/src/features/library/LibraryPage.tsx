import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { FolderPlus, ListChecks, RefreshCw, Search, TriangleAlert } from 'lucide-react';

import { EmptyState } from '@/components/page/EmptyState';
import { usePageHeading } from '@/components/page/usePageHeading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented, SegmentedItem } from '@/components/ui/segmented';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isMacPlatform } from '@/app/shell/platform';
import { BulkBar } from '@/features/collections/BulkBar';
import { ShelfRows } from '@/features/collections/ShelfRows';
import { usePageCover } from '@/lib/theme/coverTheme';

import { ContinueHero } from './ContinueHero';
import { addFolderAndScan, refreshLibrary, rescanLibrary, useLibrary } from './libraryStore';
import { ScanStatus } from './ScanStatus';
import {
  EMPTY_SELECTION,
  keepShown,
  select,
  selectedInOrder,
  toggleAll,
  type Selection,
} from './selection';
import {
  continueShelf,
  FILTERS,
  shelve,
  SORTS,
  type ShelfFilter,
  type ShelfQuery,
  type ShelfSort,
} from './shelf';
import { ShelfGrid } from './ShelfGrid';

const route = getRouteApi('/shell/library');

export interface LibrarySearch {
  filter?: ShelfFilter;
  sort?: ShelfSort;
  q?: string;
}

/** `?filter=&sort=&q=` on /library, so going back from a series restores the view. */
export function validateLibrarySearch(search: Record<string, unknown>): LibrarySearch {
  const filter = FILTERS.find(f => f.value === search.filter)?.value;
  const sort = SORTS.find(s => s.value === search.sort)?.value;
  const q = typeof search.q === 'string' && search.q ? search.q : undefined;
  return {
    ...(filter && filter !== 'all' ? { filter } : {}),
    ...(sort && sort !== 'recent' ? { sort } : {}),
    ...(q ? { q } : {}),
  };
}

export function LibraryPage() {
  const library = useLibrary();
  const params = route.useSearch();
  const navigate = route.useNavigate();
  const query: ShelfQuery = {
    filter: params.filter ?? 'all',
    sort: params.sort ?? 'recent',
    search: params.q ?? '',
  };
  const setQuery = (patch: Partial<ShelfQuery>) =>
    void navigate({
      search: prev =>
        validateLibrarySearch({
          filter: patch.filter ?? prev.filter,
          sort: patch.sort ?? prev.sort,
          q: patch.search ?? prev.q,
        }),
      replace: true,
    });

  // Typing stays responsive on huge libraries: the grid catches up a beat later.
  const search = useDeferredValue(query.search);
  const { filter, sort } = query;
  const shown = useMemo(
    () => shelve(library.series, { filter, sort, search }),
    [library.series, filter, sort, search]
  );
  const shelf = useMemo(() => continueShelf(library.series), [library.series]);
  const chapters = useMemo(
    () => library.series.reduce((sum, s) => sum + s.chapterCount, 0),
    [library.series]
  );
  const heading = usePageHeading('Library');
  // The library wears the colours of the series it would resume.
  usePageCover(shelf.hero?.cover);
  const bulk = useBulkSelect(shown);

  if (library.status === 'error') {
    return (
      <>
        <h1 ref={heading} tabIndex={-1} className="sr-only">
          Library
        </h1>
        <EmptyState
          tone="alert"
          title="The library could not be opened"
          actions={
            <Button variant="primary" onClick={() => void refreshLibrary()}>
              <RefreshCw /> Try again
            </Button>
          }
        >
          <p>Your files are untouched. The reason given was:</p>
          <code className="mt-3 block rounded-lg border border-line bg-ink-1 px-3 py-2 font-mono text-xs break-words text-fg-2">
            {library.error}
          </code>
        </EmptyState>
      </>
    );
  }

  const empty = library.status === 'ready' && library.series.length === 0;
  const scanning = library.scan !== null;

  if (empty) {
    return (
      <>
        <header className="mb-8">
          <h1
            ref={heading}
            tabIndex={-1}
            className="m-0 mb-2 font-display text-4xl font-bold tracking-[-0.01em] outline-none [font-variation-settings:'wdth'_80,'opsz'_72]"
          >
            Library
          </h1>
          <p className="m-0 max-w-[62ch] text-fg-2">
            Your manga, read in place from the folders you choose. Nothing is copied or converted.
          </p>
        </header>
        <EmptyState
          title={
            scanning
              ? 'Looking through your folder'
              : library.roots.length > 0
                ? 'No manga found yet'
                : 'Your shelf is empty'
          }
          actions={
            scanning ? (
              <ScanStatus scan={library.scan} error={null} className="w-full" />
            ) : (
              <>
                <Button variant="primary" onClick={() => void addFolderAndScan()}>
                  <FolderPlus /> Add a folder
                </Button>
                {library.roots.length > 0 && (
                  <Button variant="ghost" onClick={() => void rescanLibrary()}>
                    <RefreshCw /> Scan again
                  </Button>
                )}
              </>
            )
          }
        >
          <p>
            {scanning
              ? 'Every series shows up here with its cover as soon as the scan is done. Your files are only read, never changed.'
              : 'Point KireiManga at a folder of CBZ or CBR archives, or folders of images, and every series in it shows up here with its cover.'}
          </p>
        </EmptyState>
        {!scanning && <ScanStatus scan={null} error={library.scanError} />}
      </>
    );
  }

  return (
    <>
      {shelf.hero && !query.search && query.filter === 'all' && !bulk.selecting && (
        <ContinueHero hero={shelf.hero} mode={shelf.mode} also={shelf.also} />
      )}
      {!query.search && query.filter === 'all' && !bulk.selecting && <ShelfRows />}

      <section aria-labelledby="library-heading">
        <div className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-3">
          <h1
            id="library-heading"
            ref={heading}
            tabIndex={-1}
            className="m-0 font-display text-2xl leading-[1.1] font-[650] tracking-[-0.005em] outline-none font-condensed"
          >
            Library
          </h1>
          <span className="tabular text-sm text-fg-3">
            {library.status === 'loading'
              ? 'Loading'
              : `${library.series.length.toLocaleString('en')} series, ${chapters.toLocaleString('en')} chapters on disk`}
          </span>
          <div className="flex flex-wrap items-center gap-2 max-xl:w-full xl:ml-auto">
            <Input
              type="search"
              size="sm"
              icon={<Search />}
              aria-label="Search the library"
              placeholder="Search titles"
              value={query.search}
              onChange={event => setQuery({ search: event.target.value })}
              className="w-[220px] max-xl:basis-[calc(100%-100px)] max-xl:grow"
            />
            <span className="flex gap-2 xl:order-last">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={bulk.selecting ? 'secondary' : 'ghost'}
                    size="icon"
                    className="size-[38px]"
                    aria-label="Select series to edit"
                    aria-pressed={bulk.selecting}
                    disabled={shown.length === 0}
                    onClick={bulk.toggle}
                  >
                    <ListChecks />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Select series to tag or collect</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-[38px]"
                    aria-label="Add a folder"
                    disabled={scanning}
                    onClick={() => void addFolderAndScan()}
                  >
                    <FolderPlus />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add a folder</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-[38px]"
                    aria-label="Scan for new chapters"
                    disabled={scanning}
                    onClick={() => void rescanLibrary()}
                  >
                    <RefreshCw
                      className={scanning ? 'animate-spin motion-reduce:animate-none' : ''}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Scan for new chapters</TooltipContent>
              </Tooltip>
            </span>
            <Segmented
              aria-label="Reading state"
              value={query.filter}
              onValueChange={value => setQuery({ filter: value as ShelfFilter })}
            >
              {FILTERS.map(f => (
                <SegmentedItem key={f.value} value={f.value}>
                  {f.label}
                </SegmentedItem>
              ))}
            </Segmented>
            <Select
              value={query.sort}
              onValueChange={value => setQuery({ sort: value as ShelfSort })}
            >
              <SelectTrigger aria-label="Sort" className="h-[38px] min-w-[150px] rounded-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORTS.map(s => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <ScanStatus scan={library.scan} error={library.scanError} className="mb-6" />

        {shown.length > 0 ? (
          <ShelfGrid
            series={shown}
            label="Series"
            selection={
              bulk.selecting ? { ids: bulk.selection.ids, onSelect: bulk.onSelect } : undefined
            }
          />
        ) : (
          library.status === 'ready' && (
            <EmptyState
              title="Nothing here yet"
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setQuery({ filter: 'all', search: '' })}
                >
                  Show everything
                </Button>
              }
            >
              <p>
                {query.search ? (
                  <>
                    No title matches <q>{query.search}</q>
                    {query.filter !== 'all' && ' with this filter'}.
                  </>
                ) : (
                  'No series match this filter. Kirei is still on volume one too.'
                )}
              </p>
            </EmptyState>
          )
        )}
        {bulk.selecting && (
          <BulkBar
            seriesIds={bulk.ids}
            shownCount={shown.length}
            onSelectAll={bulk.selectAll}
            onDone={bulk.toggle}
          />
        )}
        {library.series.some(s => s.missing) && (
          <p className="mt-10 flex items-center gap-2 text-xs text-fg-3">
            <TriangleAlert className="size-3.5" aria-hidden /> Greyed out series have gone missing
            from disk. Their reading progress is kept.
          </p>
        )}
      </section>
    </>
  );
}

/**
 * Selection mode of the grid for bulk edit. The selection follows the grid:
 * series a search or filter hides drop out of it. Esc leaves selection mode
 * and Ctrl or Cmd+A selects everything shown.
 */
function useBulkSelect(shown: readonly { id: number }[]) {
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const order = useMemo(() => shown.map(s => s.id), [shown]);

  useEffect(() => {
    setSelection(prev => keepShown(prev, order));
  }, [order]);

  useEffect(() => {
    if (!selecting) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [role="dialog"], [data-slot="popover"]')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setSelecting(false);
        setSelection(EMPTY_SELECTION);
      } else if (event.key === 'a' && (isMacPlatform() ? event.metaKey : event.ctrlKey)) {
        event.preventDefault();
        setSelection(prev => toggleAll(prev, order));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecting, order]);

  return {
    selecting,
    selection,
    ids: selectedInOrder(selection, order),
    onSelect: (id: number, range: boolean) => setSelection(prev => select(prev, id, order, range)),
    selectAll: () => setSelection(prev => toggleAll(prev, order)),
    toggle: () => {
      setSelecting(on => !on);
      setSelection(EMPTY_SELECTION);
    },
  };
}
