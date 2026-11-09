/**
 * Multi select in the library grid, as pure functions over ids. A plain
 * click toggles one series and moves the anchor to it; a Shift click selects
 * the run from the anchor to it in the order the grid shows, the way file
 * managers do. Ids the grid no longer shows (a filter or search changed)
 * drop out, so a bulk edit only ever touches what is on screen.
 */

export interface Selection {
  ids: ReadonlySet<number>;
  /** Where the next Shift click range starts. */
  anchor: number | null;
}

export const EMPTY_SELECTION: Selection = { ids: new Set(), anchor: null };

/** Toggles `id`, or with `range` selects from the anchor to `id` in `order`. */
export function select(
  selection: Selection,
  id: number,
  order: readonly number[],
  range = false
): Selection {
  if (range && selection.anchor !== null) {
    const from = order.indexOf(selection.anchor);
    const to = order.indexOf(id);
    if (from >= 0 && to >= 0) {
      const ids = new Set(selection.ids);
      const [lo, hi] = from < to ? [from, to] : [to, from];
      for (const each of order.slice(lo, hi + 1)) ids.add(each);
      return { ids, anchor: selection.anchor };
    }
  }
  const ids = new Set(selection.ids);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  return { ids, anchor: id };
}

/** Everything shown, or nothing when everything shown is already selected. */
export function toggleAll(selection: Selection, order: readonly number[]): Selection {
  const all = order.length > 0 && order.every(id => selection.ids.has(id));
  return all ? EMPTY_SELECTION : { ids: new Set(order), anchor: order[0] ?? null };
}

/** Drops ids that are not in `shown` any more. Returns the same object when nothing changed. */
export function keepShown(selection: Selection, shown: readonly number[]): Selection {
  const visible = new Set(shown);
  let changed = false;
  const ids = new Set<number>();
  for (const id of selection.ids) {
    if (visible.has(id)) ids.add(id);
    else changed = true;
  }
  const anchor =
    selection.anchor !== null && visible.has(selection.anchor) ? selection.anchor : null;
  if (!changed && anchor === selection.anchor) return selection;
  return { ids, anchor };
}

/** Selected ids in the order the grid shows them. */
export function selectedInOrder(selection: Selection, order: readonly number[]): number[] {
  return order.filter(id => selection.ids.has(id));
}
