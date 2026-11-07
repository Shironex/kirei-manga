import { isTauri } from '@/lib/ipc';

/**
 * Window chrome. macOS uses an overlay title bar: the traffic lights sit on the
 * rail and the window drags from the top strip, so the gallery runs edge to edge.
 * Windows keeps native decorations (dark theme): Snap Layouts, the system menu
 * and accessibility come for free, and a custom bar would have to rebuild them.
 */
export type Chrome = 'overlay' | 'native';

export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);
}

export function detectChrome(): Chrome {
  return isTauri() && isMacPlatform() ? 'overlay' : 'native';
}

/** Written once at startup; CSS and the shell read `data-chrome` from <html>. */
export function applyChrome(chrome: Chrome = detectChrome()): void {
  document.documentElement.dataset.chrome = chrome;
}

/** "Cmd" on macOS, "Ctrl" elsewhere, for shortcut hints. */
export function modKeyLabel(): string {
  return isMacPlatform() ? '⌘' : 'Ctrl';
}
