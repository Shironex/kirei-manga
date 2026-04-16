import { useCallback } from 'react';
import type { FitMode } from '@kireimanga/shared';
import { READER_ZOOM_MAX, READER_ZOOM_MIN, useReaderStore } from '@/stores/reader-store';
import { useT } from '@/hooks/useT';

interface Props {
  pageUrl: string;
  pageNumber: number;
  totalPages: number;
  fit: FitMode;
  /** Whether the page at `pageNumber - 1` is currently bookmarked. */
  isBookmarked?: (pageIndex: number) => boolean;
}

const ZOOM_STEP = 0.1;

function fitClass(fit: FitMode): string {
  switch (fit) {
    case 'width':
      return 'w-full h-auto max-h-none';
    case 'height':
      return 'h-full w-auto';
    case 'original':
    default:
      return 'max-w-none max-h-none';
  }
}

export function SinglePageView({ pageUrl, pageNumber, totalPages, fit, isBookmarked }: Props) {
  const t = useT();
  const zoom = useReaderStore(s => s.zoom);
  const setZoom = useReaderStore(s => s.setZoom);
  const showBookmarkDot = isBookmarked?.(pageNumber - 1) ?? false;

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      const next = Math.min(
        READER_ZOOM_MAX,
        Math.max(READER_ZOOM_MIN, zoom + direction * ZOOM_STEP)
      );
      setZoom(Number(next.toFixed(2)));
    },
    [zoom, setZoom]
  );

  return (
    <div
      onWheel={onWheel}
      className="relative flex h-screen w-screen items-center justify-center overflow-auto bg-[var(--color-ink-sunken)]"
    >
      <img
        src={pageUrl}
        alt={`Page ${pageNumber} of ${totalPages}`}
        draggable={false}
        style={
          zoom !== 1 ? { transform: `scale(${zoom})`, transformOrigin: 'center center' } : undefined
        }
        className={`select-none ${fitClass(fit)}`}
      />
      {showBookmarkDot && (
        <span
          aria-label={t('reader.page.bookmarked')}
          className="pointer-events-none absolute top-3 right-3 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
        />
      )}
    </div>
  );
}
