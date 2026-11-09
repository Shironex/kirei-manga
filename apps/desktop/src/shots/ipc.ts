import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';

import type { AppInfo } from '@/lib/ipc';
import type { SelectionShelf, SeriesRef } from '@/lib/shelf';
import type { OpenedSource, PageMeta } from '@/lib/reader';
import { DEFAULT_SETTINGS, type AppSettings } from '@/lib/settings/contract';

import desktop from '../../package.json';
import { PAGE_SIZE, STRIP_SIZE } from './art';
import {
  chapterPages,
  COLLECTION_ITEMS,
  COLLECTIONS,
  SERIES_TAGS,
  TAGS,
  detail,
  filterItems,
  LOCAL,
  localById,
  manga,
  NOW,
  ONLINE,
  ONLINE_TAGS,
  onlineById,
  onlineChapters,
  OVERVIEW,
  readingStats,
  summary,
  WANT,
} from './data';

/**
 * Stands in for the Rust core: every command the screens call answers from
 * the demo catalogue in `data.ts`, and `convertFileSrc` hands out the images
 * `art.ts` drew. A command nobody taught it rejects and is logged with the
 * `[shots]` prefix, which fails the capture run, so a new command shows up
 * as a failed run instead of a half empty screenshot.
 */

export const UNHANDLED = '[shots] unhandled command';

type Args = Record<string, unknown>;

interface OpenSource {
  seriesId: number;
  number: number;
  pages: number;
  webtoon: boolean;
}

const sources = new Map<number, OpenSource>();
let nextSource = 1;
// Tracking on and English first, as a reader of the README would set it up.
let settings: AppSettings = {
  ...DEFAULT_SETTINGS,
  'tracking.enabled': true,
  'online.languages': ['en', 'pl'],
};
let imageUrl: (path: string, scheme: string) => string = () => '';

/** `/demo/<title>/<title> - c042.cbz` back to its series and chapter number. */
function parseChapterPath(path: string): { seriesId: number; number: number } | null {
  const match = /c(\d{3})\.cbz$/.exec(path);
  const seed = LOCAL.find(s => path.startsWith(`/demo/${s.title}/`));
  if (!match?.[1] || !seed) return null;
  return { seriesId: seed.id, number: Number(match[1]) };
}

function pageMeta(source: OpenSource, index: number): PageMeta {
  const size = source.webtoon ? STRIP_SIZE : PAGE_SIZE;
  const width = size.width * 2;
  const height = size.height * 2;
  return {
    index,
    name: `${String(index + 1).padStart(3, '0')}.${source.webtoon ? 'png' : 'jpg'}`,
    format: source.webtoon ? 'png' : 'jpeg',
    width,
    height,
    byteLen: 420_000 + index * 1_337,
    servedWidth: width,
    servedHeight: height,
  };
}

function openSource(path: string): OpenedSource {
  const parsed = parseChapterPath(path);
  if (!parsed) throw new Error(`no demo chapter at ${path}`);
  const seed = localById(parsed.seriesId);
  const source: OpenSource = {
    ...parsed,
    pages: chapterPages(parsed.seriesId, parsed.number),
    webtoon: seed?.webtoon === true,
  };
  const id = nextSource++;
  sources.set(id, source);
  const pages = Array.from({ length: source.pages }, (_, i) => {
    const { servedWidth: _w, servedHeight: _h, ...info } = pageMeta(source, i);
    return info;
  });
  return { id, kind: 'zip', pages, openMs: 4 };
}

function sourceOf(args: Args): OpenSource {
  const source = sources.get(Number(args.id));
  if (!source) throw new Error(`unknown source ${String(args.id)}`);
  return source;
}

/** Which demo chapter and page a `kirei-page` URL names. */
export function pageOf(sourceId: number): OpenSource | undefined {
  return sources.get(sourceId);
}

/** Tags, collections and Want to Read of the series picked, counted over them. */
function selection(refs: SeriesRef[]): SelectionShelf {
  const ids = refs.flatMap(ref => (ref.source === 'local' ? [ref.seriesId] : []));
  const count = (has: (id: number) => boolean) => ids.filter(has).length;
  return {
    size: refs.length,
    wantCount: count(id => WANT.some(w => w.seriesId === id)),
    tags: TAGS.map(t => ({
      id: t.id,
      name: t.name,
      count: count(id => SERIES_TAGS[id]?.includes(t.id) ?? false),
    })).filter(t => t.count > 0),
    collections: COLLECTIONS.map(c => ({
      id: c.id,
      name: c.name,
      count: count(id => (COLLECTION_ITEMS[c.id] ?? []).some(i => i.seriesId === id)),
    })).filter(c => c.count > 0),
  };
}

/** The AniList entry a demo series is linked to: local series 1 and the second online title. */
function tracking(seriesKey: string) {
  const linked: Record<string, { title: string; total: number | null; progress: number }> = {
    'local:1': { title: 'The Moonlit Bookshop', total: 58, progress: 41 },
    [`mangadex:${ONLINE[1]?.id ?? ''}`]: {
      title: ONLINE[1]?.title ?? '',
      total: null,
      progress: 47,
    },
  };
  const entry = linked[seriesKey];
  if (!entry) return { seriesKey, link: null, localProgress: null, queued: null };
  return {
    seriesKey,
    link: {
      seriesKey,
      mediaId: 100_000 + entry.progress,
      source: 'manual',
      title: entry.title,
      totalChapters: entry.total,
      remoteProgress: entry.progress,
      remoteStatus: 'CURRENT',
      remoteScore: 8.5,
      remoteCheckedAt: NOW - 600_000,
      syncedProgress: entry.progress,
      createdAt: NOW - 90 * 86_400_000,
      updatedAt: NOW - 600_000,
    },
    localProgress: entry.progress,
    queued: null,
  };
}

const latency = { count: 120, p50Us: 1_800, p95Us: 4_200, maxUs: 9_100 };

const appInfo: AppInfo = { name: 'KireiManga', version: desktop.version, os: 'macos' };

function handle(command: string, args: Args): unknown {
  switch (command) {
    case 'app_info':
      return appInfo;
    case 'plugin:window|is_fullscreen':
      return false;

    case 'settings_get':
      return settings;
    case 'settings_set':
      settings = { ...settings, [String(args.key)]: args.value };
      return settings;

    case 'library_roots':
      return [
        {
          id: 1,
          path: '/Users/kirei/Manga',
          addedAt: NOW - 500 * 86_400_000,
          lastScanAt: NOW - 3_600_000,
          seriesCount: LOCAL.length,
        },
      ];
    case 'library_series':
      return LOCAL.map(summary);
    case 'library_series_detail': {
      const seed = localById(Number(args.id));
      return seed ? detail(seed) : null;
    }
    case 'library_series_settings':
      return null;
    case 'library_set_series_settings':
      return null;
    case 'library_record_progress':
      return {
        chapterId: args.chapterId,
        page: args.page,
        pageCount: 24,
        completed: false,
        updatedAt: NOW,
      };
    case 'library_count_orphans':
      return { progress: 0, settings: 0, shelf: 0 };
    case 'library_cover_cache':
      return { bytes: 18_400_000, files: 214 };
    case 'library_unused_covers':
      return { bytes: 0, files: 0 };

    case 'open_source':
      return openSource(String(args.path));
    case 'page_meta': {
      const source = sourceOf(args);
      return {
        revision: 1,
        pages: Array.from({ length: source.pages }, (_, i) => pageMeta(source, i)),
      };
    }
    case 'set_viewport':
    case 'set_render_quality':
      return { revision: 1 };
    case 'focus_page':
    case 'close_source':
      return null;
    case 'reader_stats':
      return {
        hits: 412,
        misses: 38,
        joined: 6,
        prefetched: 96,
        droppedStale: 2,
        cancelled: 1,
        errors: 0,
        downscaled: 120,
        original: 12,
        decodeFallbacks: 0,
        serve: latency,
        render: latency,
        cachedPages: 18,
        cachedBytes: 96_000_000,
        budgetBytes: 512_000_000,
        revision: 1,
      };

    case 'shelf_overview':
      return OVERVIEW;
    case 'shelf_want_to_read':
      return WANT;
    case 'shelf_collection_items':
      return COLLECTION_ITEMS[Number(args.id)] ?? [];
    case 'shelf_run_filter': {
      const id = OVERVIEW.filters.find(
        f => JSON.stringify(f.query) === JSON.stringify(args.query)
      )?.id;
      const items = id === undefined ? [] : filterItems(id);
      return { items, total: items.length };
    }
    case 'shelf_languages':
      return ['en', 'pl'];
    case 'shelf_selection':
      return selection(args.series as SeriesRef[]);

    case 'stats_get':
      return readingStats(Number(args.year));
    case 'stats_cover':
      return fetch(imageUrl(String(args.hash), 'kirei-cover')).then(res => res.arrayBuffer());
    case 'stats_count':
      return 412;

    case 'data_info':
      return {
        mode: 'installed',
        root: '/Users/kirei/Library/Application Support/app.kireimanga',
        database: '/Users/kirei/Library/Application Support/app.kireimanga/library.db',
        covers: '/Users/kirei/Library/Application Support/app.kireimanga/covers',
        backups: '/Users/kirei/Library/Application Support/app.kireimanga/backups',
        lastRestore: null,
        restoreError: null,
      };
    case 'third_party_notices':
      return null;

    case 'downloads_list':
      return [];
    case 'downloads_folder':
      return { path: '/Users/kirei/Manga/Downloads', inLibrary: true, error: null };

    case 'update_check':
      return { kind: 'upToDate', current: desktop.version };

    case 'anilist_status':
      return {
        configured: true,
        signedIn: true,
        viewer: { id: 1, name: 'kirei', avatar: null, siteUrl: null },
        expiresAt: NOW + 300 * 86_400_000,
        signingIn: false,
        redirectUri: 'http://127.0.0.1:47823/callback',
        rateLimit: 90,
      };
    case 'tracking_queue':
      return { pending: 0, blocked: 0, failed: 0, nextAttemptAt: null, lastError: null };
    case 'tracking_series': {
      const series = args.series as { kind: string; id: string | number };
      return tracking(`${series.kind}:${series.id}`);
    }

    case 'online_account':
      return {
        session: 'signedIn',
        username: 'kirei',
        clientId: 'personal-client-demo',
        health: { state: 'online' },
        keychain: true,
      };
    case 'online_tags':
      return ONLINE_TAGS;
    case 'online_search': {
      const title = String((args.query as { title?: string | null }).title ?? '')
        .trim()
        .toLowerCase();
      const items = ONLINE.filter(seed => seed.title.toLowerCase().includes(title)).map(manga);
      return { items, offset: 0, limit: 32, total: title ? items.length : 1_284 };
    }
    case 'online_series': {
      const seed = onlineById(String(args.mangaId));
      if (!seed) throw { kind: 'notFound', message: 'No such title.' };
      return {
        manga: manga(seed),
        following: true,
        readingStatus: 'reading',
        singleLanguage: null,
        anilistId: null,
        cached: false,
      };
    }
    case 'online_chapters': {
      const seed = onlineById(String(args.mangaId));
      if (!seed) throw { kind: 'notFound', message: 'No such title.' };
      const chapters = onlineChapters(seed);
      const markers = Object.fromEntries(
        chapters
          .filter(c => Number(c.chapter) <= Number(seed.lastChapter) - 4)
          .map(c => [c.id, { read: true, page: c.pages - 1, pending: false }])
      );
      return {
        chapters,
        preferred: settings['online.languages'][0] ?? 'en',
        outcome: { kind: 'preferred' },
        singleLanguage: null,
        markers,
      };
    }
    case 'online_follows':
      return ONLINE.slice(0, 6).map(seed => ({
        mangaId: seed.id,
        manga: manga(seed),
        readingStatus: 'reading',
      }));
    case 'online_feed':
    case 'online_refresh_feed':
      return { groups: [], lastRefresh: NOW - 1_800_000 };
  }
  console.error(`${UNHANDLED} ${command} ${JSON.stringify(args)}`);
  throw new Error(`${command} is not part of the demo`);
}

/** Answers IPC, events and window lookups the way the Rust core would. */
export function installMockCore(resolveImage: (path: string, scheme: string) => string): void {
  imageUrl = resolveImage;
  mockWindows('main');
  mockIPC((command, payload) => handle(command, (payload ?? {}) as Args), {
    shouldMockEvents: true,
  });
  const internals = (window as unknown as { __TAURI_INTERNALS__: Record<string, unknown> })
    .__TAURI_INTERNALS__;
  internals.convertFileSrc = (path: string, scheme = 'asset') => resolveImage(path, scheme);
}
