import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ForwardedRef,
  type MouseEvent,
} from 'react';
import { Flag } from 'lucide-react';
import {
  TranslationEvents,
  type BoundingBox,
  type PageTranslation,
  type TranslationReportBadPayload,
  type TranslationReportBadResponse,
} from '@kireimanga/shared';
import { emitWithResponse } from '@/lib/socket';
import { useT } from '@/hooks/useT';
import { useToast } from '@/hooks/useToast';
import { FittedText } from './FittedText';
import { DEFAULT_OVERLAY_MODE, type OverlayMode } from './overlay-mode';

interface TranslationOverlayProps {
  /** Bubbles to render — usually the value from `useTranslationForPage`. */
  page: PageTranslation;
  /** Natural pixel width of the source page image. */
  imageNaturalWidth: number;
  /** Natural pixel height of the source page image. */
  imageNaturalHeight: number;
  /**
   * The rendered <img>. When supplied, the overlay observes its layout
   * box and rescales bubble coordinates as zoom / fit changes — without
   * it the overlay falls back to a 1:1 scale (suitable for tests).
   */
  imageElement?: HTMLImageElement | null;
  /** Bubble background opacity, `0`–`1` (default `1`). */
  opacity?: number;
  /** CSS font-family applied to translated bubble text (default `var(--font-fraunces)`). */
  font?: string;
  /** CSS font-family applied to original JP text (default `var(--font-kanji)`). */
  originalFont?: string;
  /** Which text(s) to render per bubble — see `OverlayMode` (default `'translated'`). */
  mode?: OverlayMode;
}

interface BubbleBoxProps {
  box: BoundingBox;
  translated: string;
  original: string;
  scale: number;
  opacity: number;
  font: string;
  originalFont: string;
  mode: OverlayMode;
  onClick: (event: MouseEvent<HTMLDivElement>) => void;
  isActive: boolean;
}

const DEFAULT_FONT = 'var(--font-fraunces)';
const DEFAULT_ORIGINAL_FONT = 'var(--font-kanji)';

/**
 * Absolutely-positioned overlay layer that paints translated text on top of
 * a manga page image. Each bubble is anchored to its detector-reported
 * bounding box (in source pixel space) and the whole layer rescales when
 * the underlying image is zoomed or refit.
 */
export function TranslationOverlay({
  page,
  imageNaturalWidth,
  imageNaturalHeight: _imageNaturalHeight,
  imageElement,
  opacity = 1,
  font = DEFAULT_FONT,
  originalFont = DEFAULT_ORIGINAL_FONT,
  mode = DEFAULT_OVERLAY_MODE,
}: TranslationOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // G.4: which bubble (by index in `page.bubbles`) currently shows its
  // original-text popover. `null` means no popover is open. Single-state
  // means clicking another bubble switches the popover instead of stacking.
  const [activeBubbleIndex, setActiveBubbleIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!imageElement) {
      setScale(1);
      return;
    }
    if (imageNaturalWidth <= 0) {
      setScale(1);
      return;
    }

    const update = (): void => {
      const renderedWidth = imageElement.getBoundingClientRect().width;
      if (renderedWidth <= 0) return;
      setScale(renderedWidth / imageNaturalWidth);
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(imageElement);
    return () => observer.disconnect();
  }, [imageElement, imageNaturalWidth]);

  // Reset the popover whenever the page itself changes (e.g. user navigates
  // to the next chapter page) — otherwise a stale `activeBubbleIndex` would
  // anchor the popover to whichever bubble happens to share the index.
  useEffect(() => {
    setActiveBubbleIndex(null);
  }, [page.pageHash]);

  // Close on Escape, and on a mousedown that lands outside the popover and
  // outside the active bubble. Listeners are only installed while the
  // popover is actually open so we don't pay per-click work on every page.
  useEffect(() => {
    if (activeBubbleIndex === null) return;

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setActiveBubbleIndex(null);
      }
    };

    const onMouseDown = (e: globalThis.MouseEvent): void => {
      const target = e.target as Node | null;
      if (!target) return;
      // Click inside the popover stays open.
      if (popoverRef.current && popoverRef.current.contains(target)) return;
      // Click on any bubble is handled by BubbleBox's own onClick (which
      // toggles or swaps the active index) — let it through.
      if (target instanceof Element && target.closest('[data-testid="translation-bubble"]')) {
        return;
      }
      setActiveBubbleIndex(null);
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [activeBubbleIndex]);

  const handleBubbleClick = useCallback((index: number) => {
    setActiveBubbleIndex(prev => (prev === index ? null : index));
  }, []);

  if (page.bubbles.length === 0) return null;

  const activeBubble =
    activeBubbleIndex !== null ? page.bubbles[activeBubbleIndex] : undefined;

  return (
    <div
      ref={containerRef}
      data-testid="translation-overlay"
      className="translation-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        // Bubble click-through; individual BubbleBoxes re-enable pointer
        // events so the G.4 popover trigger can attach to them without the
        // wrapper blocking page-image gestures (zoom-on-wheel, drag, etc).
        pointerEvents: 'none',
      }}
    >
      {page.bubbles.map((b, i) => (
        <BubbleBox
          key={`${page.pageHash}-${i}`}
          box={b.box}
          translated={b.translated}
          original={b.original}
          scale={scale}
          opacity={opacity}
          font={font}
          originalFont={originalFont}
          mode={mode}
          isActive={activeBubbleIndex === i}
          onClick={() => handleBubbleClick(i)}
        />
      ))}
      {activeBubble && (
        <OriginalTextPopover
          ref={popoverRef}
          box={activeBubble.box}
          original={activeBubble.original}
          scale={scale}
          originalFont={originalFont}
          pageHash={page.pageHash}
          bubbleIndex={activeBubbleIndex!}
          onClose={() => setActiveBubbleIndex(null)}
        />
      )}
    </div>
  );
}

/**
 * A single translated bubble. Painted in the kinari/sumi palette so the
 * layer reads as ink-on-paper rather than a generic white rectangle.
 */
function BubbleBox({
  box,
  translated,
  original,
  scale,
  opacity,
  font,
  originalFont,
  mode,
  onClick,
  isActive,
}: BubbleBoxProps) {
  const clampedOpacity = Math.max(0, Math.min(1, opacity));
  const padding = Math.max(2, 4 * scale);
  return (
    <div
      data-testid="translation-bubble"
      data-mode={mode}
      data-active={isActive ? 'true' : 'false'}
      className="translation-bubble"
      role="button"
      tabIndex={0}
      onClick={onClick}
      style={{
        position: 'absolute',
        left: `${box.x * scale}px`,
        top: `${box.y * scale}px`,
        width: `${box.w * scale}px`,
        height: `${box.h * scale}px`,
        // Kinari paper-white background with configurable opacity. Using
        // color-mix matches the rest of the design system (oklch tokens),
        // which sidesteps inventing an `rgb(a b c / x)` fallback.
        backgroundColor: `color-mix(in oklch, var(--color-bone) ${clampedOpacity * 100}%, transparent)`,
        color: 'var(--color-ink)',
        borderRadius: 'var(--radius-sm)',
        // Re-enable pointer events so the per-bubble popover trigger can
        // hit-test against each box (the wrapper sets pointerEvents: none).
        pointerEvents: 'auto',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'stretch',
        padding: `${padding}px`,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {mode === 'translated' && (
        <BubbleRegion text={translated} font={font} testId="translation-text" />
      )}
      {mode === 'original' && (
        <BubbleRegion text={original} font={originalFont} testId="original-text" />
      )}
      {mode === 'both' && (
        <>
          <BubbleRegion
            text={original}
            font={originalFont}
            flexBasis="40%"
            testId="original-text"
          />
          <div
            data-testid="bubble-separator"
            aria-hidden
            style={{
              flex: '0 0 1px',
              backgroundColor:
                'color-mix(in oklch, var(--color-ink) 30%, transparent)',
            }}
          />
          <BubbleRegion
            text={translated}
            font={font}
            flexBasis="60%"
            testId="translation-text"
          />
        </>
      )}
    </div>
  );
}

interface BubbleRegionProps {
  text: string;
  font: string;
  /** Flex-basis for the `'both'` mode split (defaults to filling the bubble). */
  flexBasis?: string;
  testId: string;
}

/** Single text region inside a bubble — wraps `FittedText` with the flex slot it needs. */
function BubbleRegion({ text, font, flexBasis, testId }: BubbleRegionProps) {
  return (
    <div
      data-testid={testId}
      style={{
        flex: flexBasis ? `0 0 ${flexBasis}` : '1 1 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <FittedText text={text} font={font} />
    </div>
  );
}

interface OriginalTextPopoverProps {
  box: BoundingBox;
  original: string;
  scale: number;
  originalFont: string;
  /** Page hash this bubble belongs to — used to key the bad-translation flag. */
  pageHash: string;
  /** Bubble's index inside `page.bubbles` — used to key the bad-translation flag. */
  bubbleIndex: number;
  onClose: () => void;
}

/**
 * Small anchored popover that surfaces the bubble's untranslated JP text
 * (Slice G.4) and hosts the bad-translation flag form (Slice L.2).
 * Positioned in the same coordinate system as the bubble it came from —
 * placed above by default, or below if the bubble sits near the top of
 * the page so the popover would otherwise clip off-screen.
 *
 * Wrapped in `forwardRef` so the overlay's outside-click handler can
 * compare `event.target` against the popover's DOM node.
 */
const OriginalTextPopover = forwardRef(function OriginalTextPopover(
  {
    box,
    original,
    scale,
    originalFont,
    pageHash,
    bubbleIndex,
    onClose,
  }: OriginalTextPopoverProps,
  ref: ForwardedRef<HTMLDivElement>
) {
  const POPOVER_OFFSET = 8;
  const ESTIMATED_POPOVER_HEIGHT = 96;

  const anchorTop = box.y * scale;
  const anchorLeft = box.x * scale;
  const anchorWidth = box.w * scale;

  // Prefer placing the popover above the bubble. Flip below when there's
  // not enough room above for the rough popover footprint.
  const placeBelow = anchorTop < ESTIMATED_POPOVER_HEIGHT + POPOVER_OFFSET;
  const top = placeBelow
    ? anchorTop + box.h * scale + POPOVER_OFFSET
    : anchorTop - POPOVER_OFFSET;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Original text"
      data-testid="original-text-popover"
      data-placement={placeBelow ? 'below' : 'above'}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: `${top}px`,
        left: `${anchorLeft}px`,
        minWidth: `${Math.max(anchorWidth, 200)}px`,
        maxWidth: '320px',
        // Anchor the popover's bottom edge to `top` when placed above
        // (translateY(-100%)) so the bubble peeks out beneath it.
        transform: placeBelow ? 'none' : 'translateY(-100%)',
        pointerEvents: 'auto',
        zIndex: 20,
      }}
      className="border border-border bg-[var(--color-ink-raised)] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
    >
      <p
        data-testid="original-text-popover-text"
        style={{
          fontFamily: originalFont,
          fontSize: '17px',
          lineHeight: 1.5,
          color: 'var(--color-bone)',
          margin: 0,
          wordBreak: 'break-word',
        }}
      >
        {original}
      </p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <CopyButton text={original} />
        <FlagButton pageHash={pageHash} bubbleIndex={bubbleIndex} onSubmitted={onClose} />
        <button
          type="button"
          data-testid="original-text-popover-close"
          onClick={onClose}
          className="font-mono text-[10px] tracking-[0.22em] text-[var(--color-bone-muted)] uppercase transition-colors hover:text-foreground"
        >
          Close
        </button>
      </div>
    </div>
  );
});

interface CopyButtonProps {
  text: string;
}

/**
 * Small "Copy" affordance that writes the bubble's original text to the
 * clipboard via `navigator.clipboard.writeText`. Flips to a transient
 * "Copied!" label for ~1.5s on success; silently stays "Copy" if the
 * clipboard API rejects (e.g. permission denied in a non-secure context).
 */
function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);

  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard permission denied — keep the button in its idle state.
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      data-testid="original-text-popover-copy"
      onClick={onCopy}
      className="inline-flex h-7 items-center rounded-[2px] border border-border px-3 font-mono text-[10.5px] tracking-[0.22em] text-foreground uppercase transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

interface FlagButtonProps {
  pageHash: string;
  bubbleIndex: number;
  /** Called after a successful submit so the popover can close itself. */
  onSubmitted: () => void;
}

/**
 * Slice L.2 — opens an inline form inside the popover for reporting a bad
 * translation. The form holds an optional free-form note; the `reason`
 * sent over the wire is hard-coded to `'user-flagged'` for v0.3 (a reason
 * picker is a v0.5 follow-up).
 */
function FlagButton({ pageHash, bubbleIndex, onSubmitted }: FlagButtonProps) {
  const t = useT();
  const toast = useToast();
  const [flagOpen, setFlagOpen] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const closeForm = useCallback(() => {
    setFlagOpen(false);
    setNote('');
  }, []);

  const onSubmit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    const trimmed = note.trim();
    try {
      const response = await emitWithResponse<
        TranslationReportBadPayload,
        TranslationReportBadResponse
      >(TranslationEvents.REPORT_BAD, {
        pageHash,
        bubbleIndex,
        reason: 'user-flagged',
        userNote: trimmed.length > 0 ? trimmed : undefined,
      });

      if (!response.success) {
        toast.error(response.error ?? t('reader.bubble.flag.toast.errorTitle'), {
          title: t('reader.bubble.flag.toast.errorTitle'),
        });
        return;
      }

      toast.success(t('reader.bubble.flag.toast.successBody'), {
        title: t('reader.bubble.flag.toast.successTitle'),
      });
      closeForm();
      onSubmitted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), {
        title: t('reader.bubble.flag.toast.errorTitle'),
      });
    } finally {
      setSubmitting(false);
    }
  }, [bubbleIndex, closeForm, note, onSubmitted, pageHash, submitting, t, toast]);

  if (!flagOpen) {
    return (
      <button
        type="button"
        data-testid="bubble-flag-button"
        aria-label={t('reader.bubble.flag.openAria')}
        onClick={() => setFlagOpen(true)}
        className="inline-flex h-7 items-center gap-1.5 rounded-[2px] border border-border px-3 font-mono text-[10.5px] tracking-[0.22em] text-foreground uppercase transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
      >
        <Flag aria-hidden className="h-3 w-3" />
        {t('reader.bubble.flag.label')}
      </button>
    );
  }

  return (
    <div className="mt-1 w-full border border-border bg-[var(--color-ink-raised)] p-3">
      <p className="mb-2 font-mono text-[10px] tracking-[0.22em] text-[var(--color-bone-muted)] uppercase">
        {t('reader.bubble.flag.label')}
      </p>
      <textarea
        data-testid="bubble-flag-textarea"
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder={t('reader.bubble.flag.notePlaceholder')}
        rows={3}
        disabled={submitting}
        className="w-full resize-none border border-border bg-[var(--color-ink)] p-2 text-[12px] text-[var(--color-bone)] placeholder:text-[var(--color-bone-muted)] focus:border-[var(--color-accent)] focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          data-testid="bubble-flag-cancel"
          onClick={closeForm}
          disabled={submitting}
          className="font-mono text-[10px] tracking-[0.22em] text-[var(--color-bone-muted)] uppercase transition-colors hover:text-foreground disabled:opacity-50"
        >
          {t('reader.bubble.flag.cancel')}
        </button>
        <button
          type="button"
          data-testid="bubble-flag-submit"
          onClick={() => void onSubmit()}
          disabled={submitting}
          className="inline-flex h-7 items-center rounded-[2px] border border-border px-3 font-mono text-[10.5px] tracking-[0.22em] text-foreground uppercase transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50 disabled:hover:border-border disabled:hover:text-foreground"
        >
          {submitting ? t('reader.bubble.flag.submitting') : t('reader.bubble.flag.submit')}
        </button>
      </div>
    </div>
  );
}
