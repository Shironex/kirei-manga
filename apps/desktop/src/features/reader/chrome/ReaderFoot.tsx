import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ChevronLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import type { PageMeta } from '@/lib/reader';
import { cn } from '@/lib/utils';

import { ratioOf } from '../model/fit';
import type { Direction, ReaderMode } from '../model/prefs';
import { useKeyLabel } from './readerKeys';
import { Tip } from './Tip';

/** Inset of the slider's thumb centre from the track ends (half the thumb). */
const THUMB_INSET = 8;
/** Above this many pages the ticks thin out to keep the track calm. */
const MAX_TICKS = 120;
/** Hover pauses this long before the preview loads a page. */
const PEEK_DELAY_MS = 70;

function tickStep(count: number): number {
  return count <= MAX_TICKS ? 1 : Math.ceil(count / (MAX_TICKS / 2));
}

/**
 * Bottom glass bar: a page scrubber with ticks and a preview of the page
 * under the pointer, and where the reader is in the chapter. In right to left
 * the track runs right to left too, like the pages.
 */
export function ReaderFoot({
  pages,
  mode,
  direction,
  page,
  onScreen,
  progress,
  visible,
  urlFor,
  onJump,
  onBack,
  onScrubbing,
}: {
  pages: readonly PageMeta[];
  mode: ReaderMode;
  direction: Direction;
  /** First page on screen (0 based). */
  page: number;
  /** Every page on screen, for the label of a spread. */
  onScreen: readonly number[];
  /** Scroll position through the chapter in webtoon, 0 to 1. */
  progress: number;
  visible: boolean;
  urlFor: (index: number) => string;
  onJump: (index: number) => void;
  /** The left chevron: back in left to right, forward in right to left. */
  onBack: () => void;
  onScrubbing: (active: boolean) => void;
}) {
  const leftKey = useKeyLabel('page-left');
  const count = pages.length;
  const last = Math.max(0, count - 1);
  const rtl = direction === 'rtl' && mode !== 'webtoon';
  const [dragValue, setDragValue] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const value = dragValue ?? page;
  const peekIndex = dragValue ?? hover;

  const ticks = useMemo(() => {
    const step = tickStep(count);
    const marks: number[] = [];
    for (let index = 0; index < count; index += step) marks.push(index);
    if (marks[marks.length - 1] !== last && count > 1) marks.push(last);
    return marks;
  }, [count, last]);

  const pageFromPointer = (event: ReactPointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || count === 0) return null;
    const span = Math.max(1, rect.width - THUMB_INSET * 2);
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left - THUMB_INSET) / span));
    return Math.round((rtl ? 1 - fraction : fraction) * last);
  };

  let label;
  if (mode === 'webtoon') {
    label = (
      <>
        <b className="text-fg-1">{Math.round(progress * 100)}%</b> of chapter
      </>
    );
  } else {
    const shown = dragValue === null ? onScreen : [dragValue];
    const first = Math.min(...shown) + 1;
    const end = Math.max(...shown) + 1;
    label = (
      <>
        <b className="text-fg-1">{first === end ? first : `${first}-${end}`}</b> / {count}
      </>
    );
  }

  return (
    <footer
      data-testid="reader-foot"
      inert={!visible}
      className={cn(
        'glass absolute inset-x-0 bottom-0 z-[3] m-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl px-4 py-2.5',
        'transition-[opacity,transform] duration-slow ease-expo',
        !visible && 'pointer-events-none translate-y-3 opacity-0'
      )}
    >
      <Tip label={rtl ? 'Next page' : 'Previous page'} keys={leftKey} side="top">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={rtl ? 'Next page' : 'Previous page'}
          disabled={mode === 'webtoon'}
          onClick={onBack}
        >
          <ChevronLeft />
        </Button>
      </Tip>
      <div
        ref={trackRef}
        className="relative flex h-9 items-center"
        onPointerMove={event => setHover(pageFromPointer(event))}
        onPointerLeave={() => setHover(null)}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-2 top-1/2 -mt-[5px] h-2.5 max-md:hidden"
        >
          {ticks.map(index => {
            const fraction = last === 0 ? 0 : index / last;
            const edge = index === 0 || index === last;
            return (
              <i
                key={index}
                className={cn(
                  'absolute w-px',
                  edge ? '-top-0.5 h-3.5 bg-[oklch(1_0_0/0.4)]' : 'inset-y-0 bg-[oklch(1_0_0/0.16)]'
                )}
                style={{ left: `${(rtl ? 1 - fraction : fraction) * 100}%` }}
              />
            );
          })}
        </div>
        <Slider
          aria-label="Page"
          dir={rtl ? 'rtl' : 'ltr'}
          min={0}
          max={last}
          step={1}
          value={[value]}
          disabled={count < 2}
          onPointerDown={() => onScrubbing(true)}
          onValueChange={([next = 0]) => {
            setDragValue(next);
            onScrubbing(true);
          }}
          onValueCommit={([next = 0]) => {
            setDragValue(null);
            onScrubbing(false);
            onJump(next);
          }}
          onLostPointerCapture={() => {
            setDragValue(null);
            onScrubbing(false);
          }}
        />
        {peekIndex !== null && pages[peekIndex] && (
          <Peek
            page={pages[peekIndex]}
            count={count}
            url={urlFor(peekIndex)}
            left={`calc(${THUMB_INSET}px + (100% - ${THUMB_INSET * 2}px) * ${
              last === 0 ? 0 : rtl ? 1 - peekIndex / last : peekIndex / last
            })`}
          />
        )}
      </div>
      <span
        data-testid="page-number"
        className="text-sm font-semibold whitespace-nowrap text-fg-2 tabular-nums"
      >
        {label}
      </span>
    </footer>
  );
}

/** The preview above the scrubber: a small copy of the page and its number. */
function Peek({
  page,
  count,
  url,
  left,
}: {
  page: PageMeta;
  count: number;
  url: string;
  left: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setSrc(url), PEEK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [url]);
  const ratio = ratioOf(page);

  return (
    <div
      aria-hidden
      data-testid="peek"
      className="glass pointer-events-none absolute bottom-11 -ml-[46px] w-[92px] animate-pop rounded-[10px] p-1 text-center text-xs"
      style={{ left }}
    >
      <div
        className="overflow-hidden rounded-[4px] bg-ink-2"
        style={{ aspectRatio: String(Math.max(ratio, 0.45)) }}
      >
        {src && <img src={src} alt="" className="size-full object-cover object-top" />}
      </div>
      <span className="mt-1 block text-fg-2 tabular-nums">
        <b className="text-fg-1">{page.index + 1}</b> / {count}
      </span>
    </div>
  );
}
