/**
 * Overlay rendering modes for the translation layer (Slice G.3).
 * Cycled by the reader's `T` key in `translated → original → both` order.
 */
export type OverlayMode = 'translated' | 'original' | 'both';

export const DEFAULT_OVERLAY_MODE: OverlayMode = 'translated';

const CYCLE: Readonly<Record<OverlayMode, OverlayMode>> = {
  translated: 'original',
  original: 'both',
  both: 'translated',
};

/** Returns the next mode in the `translated → original → both` cycle. */
export function nextOverlayMode(current: OverlayMode): OverlayMode {
  return CYCLE[current];
}
