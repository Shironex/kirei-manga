import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { NAV_SHORTCUTS } from '@/app/shell/useShortcuts';
import { modKeyLabel } from '@/app/shell/platform';
import { useLibrary } from '@/features/library/libraryStore';
import { getSeriesDetail } from '@/lib/library';

import { queryWords } from './fuzzy';
import {
  chapterEntries,
  SECTION_LIMITS,
  searchEntries,
  seriesEntries,
  staticEntries,
} from './index';
import { resolveRecents } from './recents';
import { getPaletteSources, subscribePaletteSources } from './sources';
import { SECTION_LABELS, type IndexEntry, type PaletteItem, type PaletteSection } from './types';

export interface ResultGroup {
  id: string;
  label: string;
  section: PaletteSection;
  items: PaletteItem[];
}

/** Chapters are read for the best few series a query finds, no more. */
const CHAPTER_SERIES = 3;
const PAUSE_MS = 120;

export interface PaletteResults {
  groups: ResultGroup[];
  /** The groups' items in display order, for arrow key movement. */
  flat: PaletteItem[];
}

/**
 * The results for a query: the memoised series index and the fixed entries
 * answer at once, chapters and registered sources fill in after a short
 * pause. Mounted while the palette is closed too, so the index is built
 * before the first Ctrl+K.
 */
export function usePaletteResults(query: string, recent: PaletteItem[]): PaletteResults {
  const { series, version } = useLibrary();
  const index = useMemo(() => seriesEntries(series), [series]);
  const fixed = useMemo(() => staticEntries(path => [modKeyLabel(), NAV_SHORTCUTS[path]]), []);

  const byId = useMemo(() => {
    const map = new Map<string, PaletteItem>();
    for (const e of fixed) map.set(e.item.id, e.item);
    for (const e of index) map.set(e.item.id, e.item);
    return map;
  }, [fixed, index]);

  const seriesIds = useMemo(() => new Set(series.map(s => s.id)), [series]);

  const local = useMemo(() => {
    const out = {} as Record<
      Exclude<PaletteSection, 'recent' | 'chapters' | 'online'>,
      PaletteItem[]
    >;
    const run = (section: keyof typeof out, entries: readonly IndexEntry[]) => {
      out[section] = searchEntries(entries, query, SECTION_LIMITS[section]).map(h => h.item);
    };
    run('series', index);
    run(
      'pages',
      fixed.filter(e => e.item.section === 'pages')
    );
    run(
      'settings',
      fixed.filter(e => e.item.section === 'settings')
    );
    run(
      'actions',
      fixed.filter(e => e.item.section === 'actions')
    );
    return out;
  }, [query, index, fixed]);

  const chapters = useChapterHits(query, version, local.series);
  const online = useSourceHits(query);

  return useMemo(() => {
    const groups: ResultGroup[] = [];
    const add = (section: PaletteSection, items: PaletteItem[], label?: string, id?: string) => {
      if (items.length > 0) {
        groups.push({ id: id ?? section, label: label ?? SECTION_LABELS[section], section, items });
      }
    };
    if (queryWords(query).length === 0) {
      const shownRecent = resolveRecents(recent, byId, id => seriesIds.has(id));
      add('recent', shownRecent);
      const shown = new Set(shownRecent.map(r => r.id));
      const rest = (section: 'pages' | 'actions') =>
        fixed.filter(e => e.item.section === section && !shown.has(e.item.id)).map(e => e.item);
      add('pages', rest('pages'));
      add('actions', rest('actions'));
    } else {
      add('series', local.series);
      add('chapters', chapters);
      add('pages', local.pages);
      add('settings', local.settings);
      add('actions', local.actions);
      for (const g of online) add('online', g.items, g.label, `online:${g.id}`);
    }
    return { groups, flat: groups.flatMap(g => g.items) };
  }, [query, recent, fixed, local, chapters, online, seriesIds, byId]);
}

/** Chapters of the best matching series, read on demand and cached per catalogue version. */
function useChapterHits(query: string, version: number, topSeries: PaletteItem[]): PaletteItem[] {
  const cache = useRef(new Map<string, IndexEntry[]>());
  const [hits, setHits] = useState<{ query: string; items: PaletteItem[] }>({
    query: '',
    items: [],
  });
  const seriesKey = topSeries
    .slice(0, CHAPTER_SERIES)
    .map(i => (i.target.type === 'series' ? i.target.seriesId : 0))
    .join(',');

  useEffect(() => {
    const words = queryWords(query);
    if (words.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const ids = seriesKey ? seriesKey.split(',').map(Number) : [];
      const entries: IndexEntry[] = [];
      for (const id of ids) {
        const key = `${version}:${id}`;
        let built = cache.current.get(key);
        if (!built) {
          try {
            const detail = await getSeriesDetail(id);
            built = detail ? chapterEntries(detail) : [];
          } catch {
            built = [];
          }
          cache.current.set(key, built);
        }
        entries.push(...built);
      }
      if (cancelled) return;
      // A chapter shows only when the query says something about the chapter,
      // not merely the series name it inherits.
      const about = entries.filter(e => words.some(w => e.text.title.includes(w)));
      setHits({
        query,
        items: searchEntries(about, query, SECTION_LIMITS.chapters).map(h => h.item),
      });
    }, PAUSE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, version, seriesKey]);

  return hits.query === query ? hits.items : [];
}

interface SourceGroup {
  id: string;
  label: string;
  items: PaletteItem[];
}

/** Results of the registered sources (the online lane), aborted when the query moves on. */
function useSourceHits(query: string): SourceGroup[] {
  const sources = useSyncExternalStore(subscribePaletteSources, getPaletteSources);
  const [found, setFound] = useState<{ query: string; groups: SourceGroup[] }>({
    query: '',
    groups: [],
  });
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2 || sources.length === 0) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const groups = await Promise.all(
        sources.map(async (source): Promise<SourceGroup> => {
          try {
            const items = await source.search(trimmed, controller.signal);
            return {
              id: source.id,
              label: source.label ?? SECTION_LABELS[source.section],
              items: items.slice(0, SECTION_LIMITS.online),
            };
          } catch {
            return { id: source.id, label: source.label ?? SECTION_LABELS.online, items: [] };
          }
        })
      );
      if (!controller.signal.aborted) setFound({ query: trimmed, groups });
    }, PAUSE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [trimmed, sources]);

  return found.query === trimmed ? found.groups : [];
}
