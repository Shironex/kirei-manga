import { useSyncExternalStore } from 'react';

/** Whether the palette is open. A store so the shortcut and any button can open it. */
let open = false;
const listeners = new Set<() => void>();

export function setPaletteOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const l of listeners) l();
}

export const openPalette = () => setPaletteOpen(true);
export const togglePalette = () => setPaletteOpen(!open);

export function usePaletteOpen(): boolean {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open
  );
}
