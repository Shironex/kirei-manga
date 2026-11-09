import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';

import { registerPaletteSource } from '@/features/palette/sources';
import type { PaletteItem } from '@/features/palette/types';
import { isTauri } from '@/lib/ipc';
import { searchManga, type Manga } from '@/lib/online';
import { getSettingsState } from '@/lib/settings/store';

import { mangaTitle } from './model';

/** Results the palette asks MangaDex for per query. */
const LIMIT = 6;

/** A MangaDex series as a palette item; `open` goes to its page. */
export function mangaItem(
  manga: Manga,
  chain: readonly string[],
  open: (id: string) => void
): PaletteItem {
  const facts = [manga.year, manga.status].filter(Boolean).join(' · ');
  return {
    id: `mangadex:${manga.id}`,
    section: 'online',
    title: mangaTitle(manga, chain),
    subtitle: facts ? `MangaDex · ${facts}` : 'MangaDex',
    target: { type: 'custom', run: () => open(manga.id) },
  };
}

/**
 * Adds a MangaDex section to the command palette: a typed title searches
 * MangaDex (with the reader's languages and ratings) and Enter opens the
 * series page. Errors such as offline or a rate limit just leave the section
 * out; the local results never wait for it.
 */
export function useMangaDexPalette(): void {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isTauri()) return;
    const open = (mangaId: string) =>
      void navigate({ to: '/online/$mangaId', params: { mangaId } });
    return registerPaletteSource({
      id: 'mangadex',
      label: 'MangaDex',
      section: 'online',
      search: async (query, signal) => {
        const page = await searchManga({ title: query, limit: LIMIT });
        if (signal.aborted) return [];
        const chain = getSettingsState().settings['online.languages'];
        return page.items.map(manga => mangaItem(manga, chain, open));
      },
    });
  }, [navigate]);
}
