import { isMacPlatform, modKeyLabel } from '@/app/shell/platform';

/**
 * The palette's shortcut, defined once. The keyboard settings lane (#95)
 * can read this from the remappable table instead; `isPaletteShortcut`,
 * the hint and the Shortcuts list all go through here.
 */
export const PALETTE_SHORTCUT = { key: 'k' } as const;

/** Ctrl+K on Windows and Linux, Cmd+K on macOS. */
export function isPaletteShortcut(event: KeyboardEvent): boolean {
  const mod = isMacPlatform() ? event.metaKey : event.ctrlKey;
  return (
    mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === PALETTE_SHORTCUT.key
  );
}

/** Keys for a hint: `['Ctrl', 'K']`. */
export function paletteShortcutKeys(): string[] {
  return [modKeyLabel(), PALETTE_SHORTCUT.key.toUpperCase()];
}
