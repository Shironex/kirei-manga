import { useEffect } from 'react';
import type { FitMode, ReaderDirection, ReaderMode } from '@kireimanga/shared';

interface Handlers {
  onNext: () => void;
  onPrev: () => void;
  onFirst: () => void;
  onLast: () => void;
  onSetFit: (fit: FitMode) => void;
  onToggleFullscreen: () => void;
  onToggleBookmark?: () => void;
  direction: ReaderDirection;
  mode: ReaderMode;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Reader keyboard bindings:
 * - Arrow Left/Right: directional (LTR: Left=prev, Right=next; RTL: inverted).
 * - a / d: same as arrows; LTR: a=prev, d=next; RTL: inverted.
 * - Space / Enter: next. Shift+Space: prev. (Ignored in webtoon — let the browser scroll.)
 * - Home / End: first / last.
 * - f / F: toggle fullscreen.
 * - 1 / 2 / 3: fit width / height / original.
 * - b / B: toggle a bookmark on the current page (no-op when handler missing).
 *
 * TODO(post-v0.1): consume settings.shortcuts so users can rebind these from
 * Settings → Keyboard. The schema is already keyed and persisted; the UI just
 * lists bindings read-only for v0.1.
 */
export function useReaderKeyboard(handlers: Handlers): void {
  const {
    onNext,
    onPrev,
    onFirst,
    onLast,
    onSetFit,
    onToggleFullscreen,
    onToggleBookmark,
    direction,
    mode,
  } = handlers;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      const ltr = direction === 'ltr';
      const isWebtoon = mode === 'webtoon';

      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A': {
          e.preventDefault();
          (ltr ? onPrev : onNext)();
          return;
        }
        case 'ArrowRight':
        case 'd':
        case 'D': {
          e.preventDefault();
          (ltr ? onNext : onPrev)();
          return;
        }
        case ' ': {
          if (isWebtoon) return; // Let the browser handle vertical paging.
          e.preventDefault();
          if (e.shiftKey) onPrev();
          else onNext();
          return;
        }
        case 'Enter': {
          if (isWebtoon) return;
          e.preventDefault();
          onNext();
          return;
        }
        case 'Home': {
          e.preventDefault();
          onFirst();
          return;
        }
        case 'End': {
          e.preventDefault();
          onLast();
          return;
        }
        case 'f':
        case 'F': {
          e.preventDefault();
          onToggleFullscreen();
          return;
        }
        case '1': {
          e.preventDefault();
          onSetFit('width');
          return;
        }
        case '2': {
          e.preventDefault();
          onSetFit('height');
          return;
        }
        case '3': {
          e.preventDefault();
          onSetFit('original');
          return;
        }
        case 'b':
        case 'B': {
          if (!onToggleBookmark) return;
          e.preventDefault();
          onToggleBookmark();
          return;
        }
        default:
          return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    onNext,
    onPrev,
    onFirst,
    onLast,
    onSetFit,
    onToggleFullscreen,
    onToggleBookmark,
    direction,
    mode,
  ]);
}
