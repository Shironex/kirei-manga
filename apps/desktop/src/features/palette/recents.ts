import type { PaletteItem } from './types';

const KEY = 'kirei.palette.recent';
export const RECENT_LIMIT = 6;

/** Items that can be stored: a custom target holds a function and cannot be. */
function storable(item: PaletteItem): boolean {
  return item.target.type !== 'custom';
}

export function loadRecents(): PaletteItem[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw)
      ? raw.filter(
          (r): r is PaletteItem =>
            typeof r === 'object' &&
            r !== null &&
            typeof (r as PaletteItem).id === 'string' &&
            typeof (r as PaletteItem).title === 'string' &&
            typeof (r as PaletteItem).target === 'object'
        )
      : [];
  } catch {
    return [];
  }
}

/** Moves an item to the front of the list and returns the new list. */
export function pushRecent(list: readonly PaletteItem[], item: PaletteItem): PaletteItem[] {
  if (!storable(item)) return [...list];
  return [item, ...list.filter(r => r.id !== item.id)].slice(0, RECENT_LIMIT);
}

export function saveRecents(list: readonly PaletteItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Private window or blocked storage: recents just do not persist.
  }
}

/**
 * Recents as they should show now: static items come from the current index
 * (labels and keys stay fresh), series and chapters are dropped when their
 * series is gone.
 */
export function resolveRecents(
  list: readonly PaletteItem[],
  current: ReadonlyMap<string, PaletteItem>,
  hasSeries: (id: number) => boolean
): PaletteItem[] {
  const out: PaletteItem[] = [];
  for (const r of list) {
    const t = r.target;
    if (t.type === 'series' || t.type === 'chapter') {
      if (hasSeries(t.seriesId)) out.push(current.get(r.id) ?? r);
    } else if (t.type !== 'custom') {
      const fresh = current.get(r.id);
      if (fresh) out.push(fresh);
    }
  }
  return out;
}
