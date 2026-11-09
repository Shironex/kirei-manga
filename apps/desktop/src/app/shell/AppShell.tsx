import type { ReactNode } from 'react';
import { Outlet, useRouterState } from '@tanstack/react-router';

import { CommandPalette } from '@/features/palette/CommandPalette';

import { Ambient } from './Ambient';
import { Rail } from './Rail';
import { useShortcuts } from './useShortcuts';

function focusMain() {
  const heading = document.querySelector<HTMLElement>('#main h1');
  (heading ?? document.getElementById('main'))?.focus();
}

/** Rail on the left, the routed page on the right over the ambient cover glow. */
export function AppShell() {
  return (
    <ShellFrame>
      <Outlet />
    </ShellFrame>
  );
}

/** The frame on its own, for screens rendered outside the shell route (not found). */
export function ShellFrame({ children }: { children: ReactNode }) {
  useShortcuts();
  const pathname = useRouterState({ select: s => s.location.pathname });

  return (
    <div className="relative grid h-full grid-cols-[228px_minmax(0,1fr)] overflow-hidden">
      {/* A button, not an #anchor: the hash belongs to the router. */}
      <button
        type="button"
        onClick={focusMain}
        className="absolute top-2 left-2 z-50 -translate-y-16 rounded-pill bg-fg-1 px-4 py-2 text-sm font-medium text-ink-0 focus-visible:translate-y-0"
      >
        Skip to content
      </button>
      <Rail />
      <main
        id="main"
        tabIndex={-1}
        className="relative isolate min-w-0 overflow-x-hidden overflow-y-auto outline-none"
      >
        <div
          data-tauri-drag-region
          aria-hidden
          className="sticky top-0 z-10 -mb-7 hidden h-7 [:root[data-chrome=overlay]_&]:block"
        />
        <Ambient tall={pathname.startsWith('/series/')} />
        <div key={pathname} className="max-w-[1500px] animate-enter px-12 pt-8 pb-16">
          {children}
        </div>
      </main>
      <CommandPalette />
    </div>
  );
}
