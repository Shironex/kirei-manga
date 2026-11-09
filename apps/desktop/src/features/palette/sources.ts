import type { PaletteSource } from './types';

const sources = new Map<string, PaletteSource>();
const listeners = new Set<() => void>();
let snapshot: readonly PaletteSource[] = [];

/**
 * Adds a result source, replacing one with the same id. Returns the function
 * that removes it. The MangaDex section registers here, see `PaletteSource`.
 */
export function registerPaletteSource(source: PaletteSource): () => void {
  sources.set(source.id, source);
  publish();
  return () => {
    if (sources.get(source.id) === source) {
      sources.delete(source.id);
      publish();
    }
  };
}

function publish() {
  snapshot = [...sources.values()];
  for (const listener of listeners) listener();
}

export function getPaletteSources(): readonly PaletteSource[] {
  return snapshot;
}

export function subscribePaletteSources(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
