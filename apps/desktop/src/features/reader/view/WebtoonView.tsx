import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';

import type { PageMeta } from '@/lib/reader';

import { focusedPage, layoutStrips, pageAt, visibleRange } from '../model/webtoon';
import { PageImage } from './PageImage';

/** Share of the screen one arrow press scrolls, and one page key. */
const NUDGE_SHARE = 0.15;
const SCREEN_SHARE = 0.85;
/** Screens of pages kept in the DOM above and below the visible ones. */
const OVERSCAN = 1.5;
/** Wheel travel past the bottom that carries on into the next chapter. */
const PAST_END_DELTA = 600;

export interface WebtoonHandle {
  scrollToPage: (index: number, smooth?: boolean) => void;
  /** Scrolls by `count` screens (negative goes up). */
  scrollScreens: (count: number) => void;
  nudge: (direction: 1 | -1) => void;
}

export interface WebtoonViewProps {
  ref?: Ref<WebtoonHandle>;
  pages: readonly PageMeta[];
  columnWidth: number;
  measured: ReadonlyMap<number, number>;
  urlFor: (index: number) => string;
  startPage: number;
  /** Share of the start page already scrolled past, 0 to 1. */
  startOffset?: number;
  /**
   * The next chapter's first pages, laid under the last strip with no gap, so
   * reading runs on into it. Replaces the footer.
   */
  tail?: { pages: readonly PageMeta[]; urlFor: (index: number) => string } | null;
  /**
   * The reader scrolled past the last strip into the tail: the next chapter
   * takes over at this page of it and this share of the page.
   */
  onEnterTail?: (page: number, offset: number) => void;
  onMeasure: (index: number, width: number, height: number) => void;
  /** The page a third of the way down the screen changed. */
  onFocus: (index: number) => void;
  /** Scroll position through the chapter, 0 to 1. */
  onProgress: (fraction: number) => void;
  onToggleChrome: () => void;
  /** The reader kept scrolling down at the very end of the chapter. */
  onPastEnd: () => void;
  /** Shown under the last strip when there is no tail: the end of chapter card. */
  footer: ReactNode;
}

/**
 * Continuous vertical strip. Every page has its height from `page_meta` before
 * it loads, so the scroll length is final and the scrollbar honest; only the
 * pages near the screen are in the DOM, which keeps a 200 page chapter smooth.
 * When a loaded image turns out to have another shape than its header said,
 * the page under the reader stays put while the strip around it adjusts.
 */
export function WebtoonView({
  ref,
  pages,
  columnWidth,
  measured,
  urlFor,
  startPage,
  startOffset = 0,
  tail = null,
  onEnterTail,
  onMeasure,
  onFocus,
  onProgress,
  onToggleChrome,
  onPastEnd,
  footer,
}: WebtoonViewProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 0 });
  const layout = useMemo(
    () => layoutStrips(pages, columnWidth, 0, measured),
    [pages, columnWidth, measured]
  );
  const tailPages = tail?.pages;
  const tailLayout = useMemo(
    () => (tailPages ? layoutStrips(tailPages, columnWidth) : null),
    [tailPages, columnWidth]
  );
  // Where the reader is, as a page and a share of it, so a layout change
  // (zoom, a measured page) can put them back on the same spot.
  const anchor = useRef({ page: startPage, offset: startOffset });
  const entered = useRef(false);
  const placed = useRef(false);
  const lastFocus = useRef(-1);

  useImperativeHandle(
    ref,
    () => ({
      scrollToPage: (index, smooth = false) => {
        scrollerRef.current?.scrollTo({
          top: layout.tops[index] ?? 0,
          behavior: smooth ? 'smooth' : 'instant',
        });
      },
      scrollScreens: count => {
        const scroller = scrollerRef.current;
        if (scroller)
          scroller.scrollBy({
            top: scroller.clientHeight * SCREEN_SHARE * count,
            behavior: 'smooth',
          });
      },
      nudge: direction => {
        const scroller = scrollerRef.current;
        if (scroller)
          scroller.scrollBy({
            top: scroller.clientHeight * NUDGE_SHARE * direction,
            behavior: 'smooth',
          });
      },
    }),
    [layout]
  );

  // Restore the anchor after every layout change, and place the start page
  // the first time.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || layout.tops.length === 0) return;
    const { page, offset } = anchor.current;
    const top = (layout.tops[page] ?? 0) + offset * (layout.heights[page] ?? 0);
    scroller.scrollTop = top;
    placed.current = true;
    setView({ top: scroller.scrollTop, height: scroller.clientHeight });
  }, [layout]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = scroller.scrollTop;
      const height = scroller.clientHeight;
      setView(current =>
        current.top === top && current.height === height ? current : { top, height }
      );
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(onScroll);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  // Scrolling on at the bottom flows into the next chapter, so a long read
  // needs no click between chapters.
  const pastEnd = useRef(onPastEnd);
  pastEnd.current = onPastEnd;
  // With a tail, scrolling itself carries on into the next chapter.
  const hasTail = useRef(false);
  hasTail.current = tailLayout !== null;
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let travel = 0;
    const onWheel = (event: WheelEvent) => {
      const atBottom = scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 2;
      if (hasTail.current || !atBottom || event.deltaY <= 0) {
        travel = 0;
        return;
      }
      travel += event.deltaY;
      if (travel >= PAST_END_DELTA) {
        travel = 0;
        pastEnd.current();
      }
    };
    scroller.addEventListener('wheel', onWheel, { passive: true });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, []);

  // Report focus and progress, and keep the anchor current.
  useEffect(() => {
    if (!placed.current || layout.tops.length === 0) return;
    // The last strip has scrolled out of sight: hand over to the next chapter
    // at the same spot of its pages, which look the same in its own reader.
    if (tailLayout && onEnterTail && view.top >= layout.total && !entered.current) {
      entered.current = true;
      const into = view.top - layout.total;
      const page = pageAt(tailLayout, into);
      const offset =
        (into - (tailLayout.tops[page] ?? 0)) / Math.max(1, tailLayout.heights[page] ?? 0);
      onEnterTail(page, offset);
      return;
    }
    const page = focusedPage(layout, view.top, view.height);
    anchor.current = {
      page: page,
      offset: (view.top - (layout.tops[page] ?? 0)) / Math.max(1, layout.heights[page] ?? 0),
    };
    if (page !== lastFocus.current) {
      lastFocus.current = page;
      onFocus(page);
    }
    const scroller = scrollerRef.current;
    // Progress is through this chapter only, not the tail under it.
    const range = tailLayout
      ? layout.total - view.height
      : scroller
        ? scroller.scrollHeight - scroller.clientHeight
        : 0;
    onProgress(range > 0 ? Math.min(1, Math.max(0, view.top / range)) : 0);
  }, [view, layout, tailLayout, onEnterTail, onFocus, onProgress]);

  const { start, end } = visibleRange(layout, view.top, view.height || 1, OVERSCAN);
  const shown: number[] = [];
  for (let index = start; index <= end; index += 1) shown.push(index);
  // Tail pages near the screen, the same way.
  const tailShown: number[] = [];
  const reach = (view.height || 1) * (1 + OVERSCAN);
  if (tailLayout && view.top + reach >= layout.total) {
    const range = visibleRange(tailLayout, view.top - layout.total, view.height || 1, OVERSCAN);
    for (let index = range.start; index <= range.end; index += 1) tailShown.push(index);
  }

  return (
    <div
      ref={scrollerRef}
      data-testid="webtoon"
      className="absolute inset-0 overflow-y-auto overscroll-contain"
      onClick={onToggleChrome}
    >
      <div
        className="relative mx-auto"
        style={{ width: columnWidth, height: layout.total + (tailLayout?.total ?? 0) }}
      >
        {shown.map(index => (
          <div
            key={index}
            className="absolute inset-x-0 grid place-items-center bg-ink-1"
            style={{ top: layout.tops[index], height: layout.heights[index] }}
          >
            <span aria-hidden className="font-mono text-xs text-fg-3">
              {index + 1}
            </span>
            <PageImage
              src={urlFor(index)}
              alt={`Page ${index + 1}`}
              className="absolute inset-0 size-full"
              onLoad={(width, height) => onMeasure(index, width, height)}
            />
          </div>
        ))}
        {tail &&
          tailLayout &&
          tailShown.map(index => (
            <div
              key={`next-${index}`}
              className="absolute inset-x-0 grid place-items-center bg-ink-1"
              style={{
                top: layout.total + (tailLayout.tops[index] ?? 0),
                height: tailLayout.heights[index],
              }}
            >
              <PageImage
                src={tail.urlFor(index)}
                alt={`Next chapter, page ${index + 1}`}
                className="absolute inset-0 size-full"
              />
            </div>
          ))}
      </div>
      {!tailLayout && (
        <div
          className="mx-auto grid place-items-center px-4 py-16"
          style={{ width: columnWidth }}
          onClick={event => event.stopPropagation()}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
