import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import type { CoverRef, Palette } from '@/lib/library';
import { useSetting } from '@/lib/settings/store';

import { applySeed, clampChroma, DEFAULT_SEED, type Seed } from './seed';

/**
 * Which cover the interface takes its colour from. A page puts its cover in
 * focus (the series page its own, the library the series it would resume);
 * hovering or focusing another cover previews it on top, and leaving drops
 * the preview. `useCoverTheme`, mounted once, writes the seed of whatever is
 * in front onto <html>; the registered --seed-h/--seed-c properties crossfade
 * it in 900 ms (1 ms with reduced motion). The focus is kept when a page
 * unmounts, so the reader opened from a series keeps that series' colours.
 */

export interface CoverFocus {
  /** Thumbnail hash for the ambient backdrop, null when the series has no cover. */
  hash: string | null;
  seed: Seed;
}

/**
 * The theme seed for a stored palette. Any palette maps to a seed inside the
 * range the contrast test covers: hue wrapped into [0, 360), chroma clamped to
 * [0, 0.17]. No palette (or a broken one) gives the default seed.
 */
export function seedFromPalette(palette: Pick<Palette, 'h' | 'c'> | null | undefined): Seed {
  if (!palette || !Number.isFinite(palette.h) || !Number.isFinite(palette.c)) return DEFAULT_SEED;
  return { h: ((palette.h % 360) + 360) % 360, c: clampChroma(palette.c) };
}

export function focusFromCover(cover: CoverRef | null | undefined): CoverFocus | null {
  return cover ? { hash: cover.hash, seed: seedFromPalette(cover.palette) } : null;
}

interface ThemeState {
  page: CoverFocus | null;
  preview: CoverFocus | null;
}

let state: ThemeState = { page: null, preview: null };
const subscribers = new Set<() => void>();

function set(patch: Partial<ThemeState>) {
  state = { ...state, ...patch };
  for (const notify of subscribers) notify();
}

function same(a: CoverFocus | null, b: CoverFocus | null): boolean {
  return a?.hash === b?.hash && a?.seed.h === b?.seed.h && a?.seed.c === b?.seed.c;
}

/** Puts a page's cover in focus. */
export function focusCover(cover: CoverRef | null | undefined): void {
  const page = focusFromCover(cover);
  if (!same(page, state.page)) set({ page });
}

/** Previews a cover over the page's own; null drops the preview. */
export function previewCover(cover: CoverRef | null | undefined): void {
  const preview = focusFromCover(cover);
  if (!same(preview, state.preview)) set({ preview });
}

/** The cover in front: the preview, else the page's. */
export function currentFocus(): CoverFocus | null {
  return state.preview ?? state.page;
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

export function useCoverFocus(): CoverFocus | null {
  return useSyncExternalStore(subscribe, currentFocus);
}

/** Writes the seed of the cover in front onto <html>. Mount once, at the app root. */
export function useCoverTheme(): void {
  const focus = useCoverFocus();
  const [enabled] = useSetting('appearance.coverColours');
  useEffect(() => {
    applySeed(enabled && focus ? focus.seed : DEFAULT_SEED);
  }, [enabled, focus]);
}

/** Puts `cover` in focus while the calling page is mounted (and after, until another page does). */
export function usePageCover(cover: CoverRef | null | undefined): void {
  const hash = cover?.hash;
  useEffect(() => {
    focusCover(cover);
    // The palette is fixed per hash, so the hash is the identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);
  useEffect(() => () => previewCover(null), []);
}

/** Hover waits this long before previewing, so sweeping across the grid does not strobe. */
export const PREVIEW_DELAY_MS = 140;
/** And this long after leaving before going back, so moving between covers stays on colour. */
export const PREVIEW_RELEASE_MS = 500;

/**
 * Pointer and keyboard handlers that preview a cover's colours. One instance
 * per group of covers, so moving from one cover to the next cancels the
 * pending release instead of flashing back to the page colour.
 */
export function useCoverPreview(): {
  enter: (cover: CoverRef | null) => void;
  leave: () => void;
} {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useMemo(
    () => ({
      enter(cover) {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => previewCover(cover), PREVIEW_DELAY_MS);
      },
      leave() {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => previewCover(null), PREVIEW_RELEASE_MS);
      },
    }),
    []
  );
}

/** For tests. */
export function resetCoverTheme(): void {
  state = { page: null, preview: null };
}
