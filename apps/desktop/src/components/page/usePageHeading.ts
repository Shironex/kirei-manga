import { useEffect, useRef } from 'react';

/**
 * Names the window after the page and moves focus to its heading after a
 * navigation (the heading needs tabIndex -1), so screen readers announce the
 * new page and Tab continues from the top of it. Focus only moves when it was
 * left on the body or in the rail, never away from a control on the page.
 */
export function usePageHeading<T extends HTMLElement = HTMLHeadingElement>(title: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    document.title = `${title} - KireiManga`;
    const active = document.activeElement;
    if (!active || active === document.body || active.closest('[data-shell-rail]')) {
      ref.current?.focus({ preventScroll: true });
    }
  }, [title]);
  return ref;
}
