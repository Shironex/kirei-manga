import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { ChevronLeft, ChevronRight, FileArchive, FolderOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatBytes, pageUrl } from '@/lib/reader';

import { usePageSource } from './usePageSource';

const ARCHIVE_FILTER = { name: 'Comic archives', extensions: ['cbz', 'zip', 'cbr', 'rar'] };

/**
 * Engine test bench: open an archive or folder, page through it, and watch the
 * read-ahead cache work. Not the reader UI.
 */
export function ReaderTestPage() {
  const { source, index, error, lastPageMs, stats, open, step, onPageLoaded } = usePageSource();
  const page = source?.pages[index];

  const pick = async (directory: boolean) => {
    const picked = await openDialog(
      directory ? { directory: true } : { multiple: false, filters: [ARCHIVE_FILTER] }
    );
    if (typeof picked === 'string') await open(picked);
  };

  return (
    <section className="flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void pick(false)}>
          <FileArchive /> Open archive
        </Button>
        <Button variant="ghost" onClick={() => void pick(true)}>
          <FolderOpen /> Open folder
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous page"
            disabled={!source || index === 0}
            onClick={() => step(-1)}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-24 text-center text-sm tabular-nums" data-testid="page-position">
            {source ? `${index + 1} / ${source.pages.length}` : '0 / 0'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next page"
            disabled={!source || index >= source.pages.length - 1}
            onClick={() => step(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {source && (
        <dl className="text-muted-foreground grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
          <dt>Container</dt>
          <dd className="text-foreground">{source.kind}</dd>
          <dt>Open</dt>
          <dd className="text-foreground tabular-nums">{source.openMs.toFixed(1)} ms</dd>
          <dt>Page</dt>
          <dd className="text-foreground truncate" title={page?.name}>
            {page?.name}
          </dd>
          <dt>Size</dt>
          <dd className="text-foreground tabular-nums">
            {page?.width && page.height ? `${page.width} x ${page.height}` : 'unknown'}
            {page ? `, ${formatBytes(page.byteLen)}` : ''}
          </dd>
          <dt>Last page shown in</dt>
          <dd className="text-foreground tabular-nums" data-testid="page-latency">
            {lastPageMs === null ? '...' : `${lastPageMs.toFixed(1)} ms`}
          </dd>
          <dt>Cache</dt>
          <dd className="text-foreground tabular-nums">
            {stats
              ? `${stats.cachedPages} pages, ${formatBytes(stats.cachedBytes)} of ${formatBytes(stats.budgetBytes)}`
              : '...'}
          </dd>
          <dt>Hits / misses</dt>
          <dd className="text-foreground tabular-nums">
            {stats ? `${stats.hits} / ${stats.misses}` : '...'}
          </dd>
          <dt>Read ahead / dropped</dt>
          <dd className="text-foreground tabular-nums">
            {stats ? `${stats.prefetched} / ${stats.droppedStale}` : '...'}
          </dd>
        </dl>
      )}

      {source && page && (
        <div className="bg-card flex min-h-[60vh] items-center justify-center rounded-lg border p-2">
          <img
            key={`${source.id}-${index}`}
            src={pageUrl(source.id, index)}
            alt={`Page ${index + 1}`}
            className="max-h-[75vh] w-auto object-contain"
            onLoad={onPageLoaded}
          />
        </div>
      )}
    </section>
  );
}
