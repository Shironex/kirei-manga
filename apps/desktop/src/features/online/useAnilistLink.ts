import { useEffect, useState } from 'react';

import { isTauri } from '@/lib/ipc';
import { getSeriesTracking, linkFromMangaDex, needsMangaDexLink } from '@/lib/tracking';

/**
 * Links a MangaDex series to AniList on its own when MangaDex names the
 * AniList entry and the series has no link yet, so progress can sync without
 * a search. Returns a version that changes after linking, for the tracking
 * card to reload. A failure leaves the series unlinked; the card still offers
 * a manual link.
 */
export function useAnilistLink(mangaId: string, anilistId: number | null, title: string): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!isTauri() || anilistId === null) return;
    let alive = true;
    getSeriesTracking({ kind: 'mangadex', id: mangaId })
      .then(state => {
        if (!alive || !needsMangaDexLink(anilistId, state)) return;
        return linkFromMangaDex(mangaId, anilistId, title).then(() => {
          if (alive) setVersion(v => v + 1);
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // The title only labels the link; a new language must not link again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mangaId, anilistId]);
  return version;
}
