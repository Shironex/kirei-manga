import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';

import { isMacPlatform } from './platform';

/** App-wide shortcuts. Each nav link advertises its key with aria-keyshortcuts. */
export const NAV_SHORTCUTS = {
  '/library': '1',
  '/browse': '2',
  '/downloads': '3',
  '/settings': ',',
} as const;

export type NavPath = keyof typeof NAV_SHORTCUTS;

export function ariaShortcut(path: NavPath): string {
  return `${isMacPlatform() ? 'Meta' : 'Control'}+${NAV_SHORTCUTS[path]}`;
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

export function useShortcuts(): void {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = isMacPlatform() ? event.metaKey : event.ctrlKey;
      if (!mod || event.altKey || event.shiftKey || isTyping(event.target)) return;
      const entry = Object.entries(NAV_SHORTCUTS).find(([, key]) => key === event.key);
      if (!entry) return;
      event.preventDefault();
      void navigate({ to: entry[0] as NavPath });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}
