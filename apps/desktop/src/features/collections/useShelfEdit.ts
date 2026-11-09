import { useCallback, useEffect, useState } from 'react';

import {
  addToCollection,
  createCollection,
  getSelectionShelf,
  removeFromCollection,
  setWantToRead,
  tagSeries,
  untagSeries,
  type Membership,
  type SelectionShelf,
  type SeriesRef,
} from '@/lib/shelf';

import { shelfChange, useShelf } from './shelfStore';

export interface ShelfEdit {
  /** How the selection is organised; null until first read. */
  shelf: SelectionShelf | null;
  busy: boolean;
  error: string | null;
  toggleTag: (tag: Membership, add: boolean) => void;
  createTag: (name: string) => void;
  toggleCollection: (collection: Membership, add: boolean) => void;
  createCollection: (name: string) => void;
  setWant: (want: boolean) => void;
}

/**
 * Reads how a set of series is organised and edits it: a series page (local
 * or MangaDex) passes its one ref, the bulk edit bar the selection. Every edit goes through
 * the shelf store, so Home, the palette and the collections page follow,
 * and the selection is read again after it.
 */
export function useShelfEdit(series: readonly SeriesRef[]): ShelfEdit {
  const { version } = useShelf();
  const [shelf, setShelf] = useState<SelectionShelf | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The refs as a value, so a new array with the same series is no change.
  const key = JSON.stringify(series);

  useEffect(() => {
    let cancelled = false;
    getSelectionShelf(JSON.parse(key) as SeriesRef[])
      .then(next => {
        if (!cancelled) setShelf(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [key, version]);

  const run = useCallback(
    (work: (refs: SeriesRef[]) => Promise<unknown>) => {
      const refs = JSON.parse(key) as SeriesRef[];
      if (refs.length === 0) return;
      setBusy(true);
      setError(null);
      shelfChange(() => work(refs))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setBusy(false));
    },
    [key]
  );

  return {
    shelf,
    busy,
    error,
    toggleTag: (tag, add) =>
      run(refs => (add ? tagSeries(refs, tag.name) : untagSeries(refs, tag.id))),
    createTag: name => run(refs => tagSeries(refs, name)),
    toggleCollection: (collection, add) =>
      run(refs =>
        add ? addToCollection(collection.id, refs) : removeFromCollection(collection.id, refs)
      ),
    createCollection: name =>
      run(async refs => {
        const made = await createCollection(name);
        await addToCollection(made.id, refs);
      }),
    setWant: want => run(refs => setWantToRead(refs, want)),
  };
}
