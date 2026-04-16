import { useState } from 'react';
import { useLibraryStore } from '@/stores/library-store';
import { useToastStore } from '@/stores/toast-store';

export interface UseFollowResult {
  followed: boolean;
  busy: boolean;
  error: string | null;
  toggle: () => Promise<void>;
}

/**
 * Bind a MangaDex series id to the library store's follow state and expose an
 * optimistic toggle. Returns `followed=false` while the store is loading or
 * when no id is provided.
 */
export function useFollow(mangadexId: string | undefined): UseFollowResult {
  const followed = useLibraryStore(s =>
    mangadexId ? Boolean(s.mangadexIndex[mangadexId]) : false
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (): Promise<void> => {
    if (!mangadexId || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (followed) {
        await useLibraryStore.getState().unfollow(mangadexId);
      } else {
        await useLibraryStore.getState().follow(mangadexId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      useToastStore.getState().show({
        variant: 'error',
        title: followed ? "Couldn't unfollow" : "Couldn't follow",
        body: message,
      });
    } finally {
      setBusy(false);
    }
  };

  return { followed, busy, error, toggle };
}
