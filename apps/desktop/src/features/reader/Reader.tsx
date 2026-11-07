import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { Kbd } from '@/components/ui/tooltip';
import { isTauri } from '@/lib/ipc';
import { focusPage, pageUrl } from '@/lib/reader';
import { cn } from '@/lib/utils';

import {
  AdjustHeader,
  AdjustPanel,
  ImageSettings,
  LayoutSettings,
  RememberLine,
} from './chrome/AdjustPanel';
import { ReaderBar } from './chrome/ReaderBar';
import { ReaderFoot } from './chrome/ReaderFoot';
import { StatsOverlay } from './chrome/StatsOverlay';
import { useAdjustments } from './hooks/useAdjustments';
import { useAutoHide } from './hooks/useAutoHide';
import { useElementSize } from './hooks/useElementSize';
import { useFullscreen } from './hooks/useFullscreen';
import { usePreload } from './hooks/usePreload';
import { useProgress } from './hooks/useProgress';
import { useReaderPrefs } from './hooks/useReaderPrefs';
import { useRenderQuality } from './hooks/useRenderQuality';
import { useSeriesSettings } from './hooks/useSeriesSettings';
import { useViewportHint, type PageBox } from './hooks/useViewportHint';
import { useZoomPan, ZOOM_STEP } from './hooks/useZoomPan';
import { cssFilter, defaultAdjustments, isNeutral, type Resample } from './model/adjust';
import { FIT_WIDTH_CAP, fitScreen, ratioOf } from './model/fit';
import { keyAction, type ReaderAction } from './model/keys';
import type { Background, Fit, ReaderPrefs } from './model/prefs';
import {
  buildScreens,
  lastVisiblePage,
  snapToScreen,
  stepScreen,
  type PagedPosition,
} from './model/screens';
import type { LoadedChapter } from './useChapter';
import { EndCard } from './view/EndCard';
import { PagedView, STAGE_INSET } from './view/PagedView';
import { WebtoonView, type WebtoonHandle } from './view/WebtoonView';

/** Column width of a webtoon strip at zoom 1, as in the prototype. */
const WEBTOON_WIDTH = 720;
const WEBTOON_SCALE_MIN = 0.5;
const WEBTOON_SCALE_MAX = 2;
/** Screens of pages the webview preloads ahead, and behind. */
const PRELOAD_AHEAD = 2;
const PRELOAD_BEHIND = 1;

const BACKGROUNDS: Record<Background, string> = {
  glow: 'bg-[radial-gradient(70%_80%_at_50%_45%,oklch(0.17_calc(var(--accent-c)*0.35)_var(--seed-h)),var(--ink-stage)_75%)]',
  flat: 'bg-[oklch(0.08_0.004_var(--seed-h))]',
  tint: 'bg-[oklch(0.2_calc(var(--accent-c)*0.5)_var(--seed-h))]',
};

/**
 * The box pages are rendered for, in CSS pixels: the stage on screen fit, one
 * side of it on width and height fit (the other side scrolls), the webtoon
 * column (`fit` null), and no box at all for original size.
 */
function renderBox(
  fit: Fit | null,
  inner: { width: number; height: number },
  columnWidth: number
): PageBox {
  if (fit === null) return { width: columnWidth, height: null };
  switch (fit) {
    case 'width':
      return { width: Math.min(inner.width, FIT_WIDTH_CAP), height: null };
    case 'height':
      return { width: null, height: inner.height };
    case 'original':
      return { width: null, height: null };
    default:
      return { width: inner.width, height: inner.height };
  }
}

/** Keys a focused slider uses to change its value. */
const SLIDER_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/** True when the focused control should get `key` instead of the reader. */
function ownsKey(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return true;
  // Open selects and menus own every key (Escape closes them first).
  if (target.closest('[role="listbox"], [role="menu"]') !== null) return true;
  // Space and Enter press a focused button or switch. A click hands focus
  // back to the stage (see `returnFocus`), so this is keyboard focus only.
  if ((key === ' ' || key === 'Enter') && target.closest('button, a[href], [role="switch"]'))
    return true;
  // Sliders own the keys that move them; Esc and the shortcuts still work.
  return target.closest('[role="slider"]') !== null && SLIDER_KEYS.has(key);
}

/**
 * After a click on a chrome button or switch, focus goes back to the stage,
 * so Space reads on instead of pressing the button again. Sliders keep focus
 * for their arrow keys, and popups (selects, menus) manage their own.
 */
function returnFocus(stage: HTMLElement | null) {
  const active = document.activeElement;
  if (!stage || !(active instanceof HTMLElement)) return;
  if (!active.closest('[data-reader-chrome]')) return;
  if (
    !active.matches('button, [role="switch"]') ||
    active.matches('[aria-haspopup], [role="slider"]')
  )
    return;
  stage.focus({ preventScroll: true });
}

export interface ReaderProps {
  chapter: LoadedChapter;
  /** Prefs for a title with nothing saved, from the app settings. */
  defaults: ReaderPrefs;
  /** Resampling filter for a title with nothing saved, from the app settings. */
  defaultFilter: Resample;
  onClose: () => void;
  /** Opens the next chapter of the series, when there is one. */
  onNextChapter: () => void;
  /** Picks another file, for a chapter opened from disk. */
  onOpenFile?: () => void;
}

/**
 * The reader screen for one opened chapter: single, double page and webtoon
 * modes on a full-window stage between two glass bars, which fade out while
 * reading. The stage keeps its size when they fade, so pages never jump or
 * get rendered again for a new box.
 */
export function Reader({
  chapter,
  defaults,
  defaultFilter,
  onClose,
  onNextChapter,
  onOpenFile,
}: ReaderProps) {
  const { source, pages } = chapter;
  const write = useSeriesSettings(chapter.seriesId, chapter.settings);
  const [prefs, setPrefs] = useReaderPrefs(chapter, defaults, write);
  const neutral = useMemo(() => defaultAdjustments(defaultFilter), [defaultFilter]);
  const adjust = useAdjustments(chapter, neutral, write);
  const { adjustments } = adjust;
  const { mode, direction, fit } = prefs;
  const webtoon = mode === 'webtoon';

  const stageRef = useRef<HTMLDivElement>(null);
  const stage = useElementSize(stageRef);
  const inner = { width: stage.width - STAGE_INSET * 2, height: stage.height - STAGE_INSET * 2 };
  const webtoonRef = useRef<WebtoonHandle>(null);

  const [position, setPosition] = useState<PagedPosition>({
    page: chapter.startPage,
    atEnd: false,
  });
  const [progress, setProgress] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [chromeHover, setChromeHover] = useState(false);
  const [webtoonScale, setWebtoonScale] = useState(1);
  const [measured, setMeasured] = useState<ReadonlyMap<number, number>>(() => new Map());
  const fullscreen = useFullscreen();
  const chrome = useAutoHide(panelOpen || scrubbing || chromeHover);

  const { detectSpreads, coverAlone, shift } = prefs;
  const screens = useMemo(
    () => buildScreens(pages, mode, { detectSpreads, coverAlone, shift }),
    [pages, mode, detectSpreads, coverAlone, shift]
  );
  // The page always sits on the first page of its screen, whatever the layout.
  const page = webtoon ? position.page : snapToScreen(screens, position.page);
  const atEnd = position.atEnd && !webtoon;
  const screen = useMemo(
    () => screens.find(group => group.includes(page)) ?? [page],
    [screens, page]
  );
  const screenKey = screen.join(',');

  const dpr = window.devicePixelRatio || 1;
  const size = fitScreen(
    screen.map(index => {
      const height = pages[index]?.height;
      return {
        ratio: ratioOf(pages[index], measured.get(index)),
        naturalHeight: height ? height / dpr : null,
      };
    }),
    inner,
    fit
  );
  const zoom = useZoomPan(
    { width: size.widths.reduce((sum, width) => sum + width, 0), height: size.height },
    inner
  );
  const { reset: resetZoom } = zoom;
  useEffect(() => resetZoom(), [screenKey, mode, fit, resetZoom]);

  const columnWidth = Math.max(
    240,
    Math.min(stage.width - STAGE_INSET * 2, Math.round(WEBTOON_WIDTH * webtoonScale))
  );

  const box = stage.width > 0 ? renderBox(webtoon ? null : fit, inner, columnWidth) : undefined;
  const viewportRevision = useViewportHint(box, webtoon ? 1 : zoom.zoom);
  const qualityRevision = useRenderQuality(adjustments.resample, adjustments.sharpen);
  // Both calls bump the same counter, so the later answer is the one in effect.
  const revision =
    viewportRevision === undefined || qualityRevision === undefined
      ? undefined
      : Math.max(viewportRevision, qualityRevision);
  const ready = revision !== undefined || !isTauri();
  const urlFor = useCallback(
    (index: number) => pageUrl(source.id, index, revision),
    [source.id, revision]
  );

  // Page change to image load, for the stats overlay.
  const turnAt = useRef(0);
  const [turnMs, setTurnMs] = useState<number | null>(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;

  const onMeasure = useCallback(
    (index: number, width: number, height: number) => {
      if (turnAt.current && screenRef.current.includes(index)) {
        setTurnMs(performance.now() - turnAt.current);
        turnAt.current = 0;
      }
      if (!width || !height) return;
      const ratio = width / height;
      setMeasured(current => {
        const known = ratioOf(pages[index], current.get(index));
        if (Math.abs(known - ratio) / known < 0.01) return current;
        return new Map(current).set(index, ratio);
      });
    },
    [pages]
  );

  // Tell the backend where the reader is, and which way it is going.
  const lastFocus = useRef(page);
  useEffect(() => {
    const direction = page < lastFocus.current ? 'backward' : 'forward';
    lastFocus.current = page;
    turnAt.current = performance.now();
    if (isTauri()) focusPage(source.id, page, direction).catch(() => {});
  }, [source.id, page]);

  // Warm the webview's cache with the next screens.
  const preload = useMemo(() => {
    if (!ready || webtoon) return [];
    const at = screens.findIndex(group => group.includes(page));
    const near = [
      ...screens.slice(at + 1, at + 1 + PRELOAD_AHEAD),
      ...screens.slice(Math.max(0, at - PRELOAD_BEHIND), at),
    ];
    return near.flat().map(urlFor);
  }, [ready, webtoon, screens, page, urlFor]);
  usePreload(preload);

  const finished = atEnd || (webtoon && progress >= 0.995);
  useProgress(
    chapter.chapterId,
    finished ? pages.length - 1 : webtoon ? page : lastVisiblePage(screens, { page, atEnd })
  );

  const step = useCallback(
    (delta: number) => {
      if (webtoon) {
        if (delta > 0 && progress >= 0.995 && chapter.next) onNextChapter();
        else webtoonRef.current?.scrollScreens(delta);
        return;
      }
      if (atEnd && delta > 0 && chapter.next) {
        onNextChapter();
        return;
      }
      setPosition(current => stepScreen(screens, { page, atEnd: current.atEnd }, delta));
    },
    [webtoon, progress, atEnd, chapter.next, onNextChapter, screens, page]
  );

  const jump = useCallback(
    (index: number) => {
      if (webtoon) webtoonRef.current?.scrollToPage(index);
      else setPosition({ page: snapToScreen(screens, index), atEnd: false });
    },
    [webtoon, screens]
  );

  const run = useCallback(
    (action: ReaderAction) => {
      switch (action) {
        case 'next':
        case 'prev':
          step(action === 'next' ? 1 : -1);
          chrome.hide();
          break;
        case 'nudge-down':
        case 'nudge-up':
          webtoonRef.current?.nudge(action === 'nudge-down' ? 1 : -1);
          break;
        case 'first':
          jump(0);
          break;
        case 'last':
          jump(pages.length - 1);
          break;
        case 'toggle-ui':
          chrome.toggle();
          break;
        case 'fullscreen':
          fullscreen.toggle();
          break;
        case 'mode-single':
          setPrefs({ mode: 'single' });
          break;
        case 'mode-double':
          setPrefs({ mode: 'double' });
          break;
        case 'mode-webtoon':
          setPrefs({ mode: 'webtoon' });
          break;
        case 'toggle-direction':
          if (!webtoon) setPrefs({ direction: direction === 'rtl' ? 'ltr' : 'rtl' });
          break;
        case 'toggle-shift':
          if (mode === 'double') setPrefs({ shift: !shift });
          break;
        case 'zoom-in':
        case 'zoom-out': {
          const factor = action === 'zoom-in' ? ZOOM_STEP : 1 / ZOOM_STEP;
          if (webtoon)
            setWebtoonScale(scale =>
              Math.min(WEBTOON_SCALE_MAX, Math.max(WEBTOON_SCALE_MIN, scale * factor))
            );
          else zoom.zoomBy(factor);
          break;
        }
        case 'zoom-reset':
          if (webtoon) setWebtoonScale(1);
          else zoom.reset();
          break;
        case 'toggle-panel':
          setPanelOpen(open => !open);
          break;
        case 'toggle-stats':
          setStatsOpen(open => !open);
          break;
        case 'close':
          if (panelOpen) setPanelOpen(false);
          else if (!fullscreen.exit()) onClose();
          break;
      }
    },
    [
      step,
      jump,
      chrome,
      fullscreen,
      setPrefs,
      webtoon,
      direction,
      mode,
      shift,
      zoom,
      panelOpen,
      onClose,
      pages.length,
    ]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || ownsKey(event.target, event.key)) return;
      const action = keyAction(event, { mode, direction });
      if (!action) return;
      event.preventDefault();
      run(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, mode, direction]);

  const endCard = (
    <EndCard
      label={chapter.label}
      next={chapter.next}
      onNext={onNextChapter}
      onBack={() => (webtoon ? webtoonRef.current?.scrollScreens(-1) : step(-1))}
      backLabel={webtoon ? 'Scroll back' : 'Back a page'}
      onOpenFile={onOpenFile}
      autoFocus={!webtoon}
      hint={
        webtoon ? (
          'Keep scrolling to read on'
        ) : (
          <>
            <Kbd>Space</Kbd> reads on
          </>
        )
      }
    />
  );

  return (
    <div
      role="dialog"
      aria-label={`Reader, ${chapter.title}`}
      data-testid="reader"
      data-mode={mode}
      className={cn(
        'fixed inset-0 overflow-hidden transition-[background-color] duration-theme',
        BACKGROUNDS[prefs.background],
        !chrome.visible && zoom.zoom === 1 && '[&,&_*]:cursor-none'
      )}
      onPointerUp={() => returnFocus(stageRef.current)}
      onPointerMove={event => {
        setChromeHover((event.target as Element).closest('[data-reader-chrome]') !== null);
        chrome.show();
      }}
    >
      <main
        ref={stageRef}
        id="main"
        tabIndex={-1}
        className="absolute inset-x-0 top-20 bottom-20 outline-none"
        style={
          {
            '--page-filter': cssFilter(adjustments),
            '--page-rendering': adjustments.resample === 'nearest' ? 'pixelated' : 'auto',
          } as CSSProperties
        }
      >
        {ready && stage.width > 0 && pages.length > 0 && (
          <>
            {webtoon ? (
              <WebtoonView
                ref={webtoonRef}
                pages={pages}
                columnWidth={columnWidth}
                measured={measured}
                urlFor={urlFor}
                startPage={page}
                onMeasure={onMeasure}
                onFocus={index => setPosition({ page: index, atEnd: false })}
                onProgress={setProgress}
                onToggleChrome={chrome.toggle}
                onPastEnd={() => chapter.next && onNextChapter()}
                footer={endCard}
              />
            ) : (
              <PagedView
                screen={screen}
                size={size}
                direction={direction}
                fit={fit}
                inner={inner}
                urlFor={urlFor}
                zoom={zoom}
                onStep={step}
                onToggleChrome={chrome.toggle}
                onMeasure={onMeasure}
                dimmed={atEnd}
              />
            )}
            {atEnd && (
              <div className="absolute inset-0 z-[2] grid place-items-center px-4">{endCard}</div>
            )}
          </>
        )}
      </main>

      <div data-reader-chrome>
        <ReaderBar
          title={chapter.title}
          subtitle={chapter.subtitle}
          mode={mode}
          direction={direction}
          panelOpen={panelOpen}
          visible={chrome.visible}
          fullscreen={fullscreen.fullscreen}
          onClose={onClose}
          onMode={next => setPrefs({ mode: next })}
          onDirection={() => run('toggle-direction')}
          onPanel={() => setPanelOpen(open => !open)}
        />
        {panelOpen && (
          <AdjustPanel>
            <AdjustHeader onReset={adjust.reset} canReset={!isNeutral(adjustments, neutral)} />
            <ImageSettings adjustments={adjustments} onChange={adjust.update}>
              <LayoutSettings prefs={prefs} mode={mode} onChange={setPrefs} />
              {chapter.seriesId !== null && (
                <RememberLine remember={adjust.remember} onChange={adjust.setRemember} />
              )}
            </ImageSettings>
          </AdjustPanel>
        )}
        <ReaderFoot
          pages={pages}
          mode={mode}
          direction={direction}
          page={page}
          onScreen={webtoon ? [page] : screen}
          progress={progress}
          visible={chrome.visible}
          urlFor={urlFor}
          onJump={jump}
          onBack={() => step(direction === 'rtl' ? 1 : -1)}
          onScrubbing={setScrubbing}
        />
      </div>
      {statsOpen && <StatsOverlay page={page} revision={revision} turnMs={turnMs} />}
    </div>
  );
}
