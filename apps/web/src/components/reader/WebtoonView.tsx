import { useEffect, useRef, type ReactNode } from 'react';
import { useReaderStore } from '@/stores/reader-store';
import { useT } from '@/hooks/useT';

interface Props {
  pages: string[];
  /** Whether the page at the given index is currently bookmarked. */
  isBookmarked?: (pageIndex: number) => boolean;
  /**
   * Slice G.5 — translation overlay slot, anchored to the page the store
   * currently treats as active (the topmost-visible page in the scroll
   * column). Other pages stay untranslated; a follow-up can iterate the
   * pipeline across the visible window if quota allows.
   */
  overlay?: ReactNode;
  /**
   * Index of the page the `overlay` belongs to. Mirrors `useReaderStore.pageIndex`
   * — passed in explicitly so this component stays a pure renderer.
   */
  overlayPageIndex?: number;
}

/**
 * Vertical scroll reader. Pages stack with no gap and the store's
 * `pageIndex` is updated to the topmost-visible page via IntersectionObserver
 * so chrome indicators stay accurate as the user scrolls.
 */
export function WebtoonView({ pages, isBookmarked, overlay, overlayPageIndex }: Props) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const goto = useReaderStore(s => s.goto);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img[data-page-index]'));
    if (imgs.length === 0) return;

    const observer = new IntersectionObserver(
      entries => {
        // Pick the topmost intersecting page.
        const visible = entries
          .filter(en => en.isIntersecting)
          .map(en => Number((en.target as HTMLElement).dataset.pageIndex))
          .filter(n => Number.isFinite(n))
          .sort((a, b) => a - b);
        if (visible.length > 0) {
          goto(visible[0]);
        }
      },
      { root, threshold: 0.5 }
    );

    for (const img of imgs) observer.observe(img);
    return () => observer.disconnect();
  }, [pages.length, goto]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-y-auto overflow-x-hidden bg-[var(--color-ink-sunken)]"
    >
      <div className="mx-auto flex max-w-[900px] flex-col gap-0">
        {pages.map((url, i) => (
          <div key={`${url}-${i}`} className="relative">
            <img
              data-page-index={i}
              src={url}
              alt={`Page ${i + 1} of ${pages.length}`}
              draggable={false}
              className="block w-full select-none"
            />
            {i === overlayPageIndex && overlay}
            {isBookmarked?.(i) && (
              <span
                aria-label={t('reader.page.bookmarked')}
                className="pointer-events-none absolute top-3 right-3 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
