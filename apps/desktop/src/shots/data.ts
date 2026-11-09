import type { ChapterEntry, CoverRef, SeriesDetail, SeriesSummary } from '@/lib/library';
import type { Chapter, Manga, Tag as OnlineTag } from '@/lib/online';
import type {
  Collection,
  FilterQuery,
  ShelfItem,
  ShelfOverview,
  SmartFilter,
  Tag,
} from '@/lib/shelf';
import { EMPTY_QUERY } from '@/lib/shelf';
import type { ReadingDay, ReadingStats, ReadingTotals, SeriesReading } from '@/lib/stats';

import { rng, type ArtSeries, type CoverArt } from './art';

/**
 * The demo library the screenshots show. Every title, author, group and line
 * of dialogue is made up; the covers and pages are drawn by `art.ts`. Times
 * are fixed offsets from `NOW`, and the capture script pins the page clock
 * to it, so the shots come out the same on every run.
 */

/** 2026-11-07 19:30 UTC, a Saturday evening. */
export const NOW = Date.UTC(2026, 10, 7, 19, 30);
const DAY = 86_400_000;
const HOUR = 3_600_000;

interface LocalSeed extends ArtSeries {
  id: number;
  total: number;
  read: number;
  page: number;
  pages: number;
  language: string;
  groups: string[];
  year: number;
  genres: string[];
  fresh: number;
  description: string;
  /** Days since it was last read; null for never. */
  lastRead: number | null;
  addedDays: number;
  webtoon?: boolean;
  /** Right to left (ComicInfo `YesAndRightToLeft`). */
  rtl?: boolean;
}

const art = (motif: CoverArt['motif'], h: number, c: number, more: Partial<CoverArt> = {}) => ({
  motif,
  h,
  c,
  ...more,
});

export const LOCAL: LocalSeed[] = [
  {
    id: 1,
    key: 'moonlit',
    title: 'The Moonlit Bookshop',
    jp: '月夜の書店',
    author: 'Hinata Okawa',
    art: art('moon', 272, 0.13, { vertical: true }),
    total: 58,
    read: 41,
    page: 12,
    pages: 24,
    language: 'en',
    groups: ['Paper Lantern Scans'],
    year: 2022,
    genres: ['Slice of life', 'Mystery', 'Seinen'],
    fresh: 2,
    description:
      'A bookshop in Kanazawa opens only after midnight. Its new night clerk keeps finding notes in the margins of books nobody has bought in years, and every note seems to answer the one before it.',
    lastRead: 0.06,
    addedDays: 210,
    rtl: true,
  },
  {
    id: 2,
    key: 'stardust',
    title: 'Stardust Relay',
    jp: '星屑リレー',
    author: 'Mio Tachibana',
    art: art('orbit', 196, 0.11, { title: 'bottom' }),
    total: 77,
    read: 12,
    page: 3,
    pages: 22,
    language: 'en',
    groups: ['Moonbeam TL'],
    year: 2021,
    genres: ['Sci-fi', 'Adventure'],
    fresh: 0,
    description:
      'Two couriers run messages between orbital stations that have stopped trusting radio.',
    lastRead: 1.2,
    addedDays: 160,
    rtl: true,
  },
  {
    id: 3,
    key: 'ember',
    title: 'Ash and Ember',
    jp: '灰と火種',
    author: 'Kaito Ren',
    art: art('ember', 42, 0.15, { vertical: true }),
    total: 140,
    read: 88,
    page: 4,
    pages: 14,
    language: 'en',
    groups: ['Hearth Team'],
    year: 2020,
    genres: ['Action', 'Fantasy', 'Webtoon'],
    fresh: 5,
    description:
      'After the city burns, a fire spirit and a firefighter share one body and very different opinions about what should be saved first.',
    lastRead: 2.4,
    addedDays: 300,
    webtoon: true,
  },
  {
    id: 4,
    key: 'archive',
    title: 'Sumire Archive',
    jp: 'すみれの書庫',
    author: 'Aoi Kurosaki',
    art: art('archive', 302, 0.13, { title: 'bottom' }),
    total: 22,
    read: 5,
    page: 9,
    pages: 20,
    language: 'en',
    groups: ['Paper Lantern Scans'],
    year: 2023,
    genres: ['Fantasy', 'Mystery'],
    fresh: 1,
    description: 'An archivist catalogues books that rewrite themselves at night.',
    lastRead: 4.5,
    addedDays: 90,
    rtl: true,
  },
  {
    id: 5,
    key: 'akane',
    title: 'Akane Signal',
    jp: '茜シグナル',
    author: 'Rei Sakuraba',
    art: art('sun', 30, 0.17),
    total: 31,
    read: 31,
    page: 0,
    pages: 20,
    language: 'en',
    groups: ['Moonbeam TL'],
    year: 2019,
    genres: ['Drama', 'Romance'],
    fresh: 0,
    description: 'A radio club, a broken transmitter, one summer.',
    lastRead: 9,
    addedDays: 400,
    rtl: true,
  },
  {
    id: 6,
    key: 'wiedzma',
    title: 'Wiedźma z Bieszczad',
    jp: null,
    author: 'Agata Wróbel',
    art: art('forest', 150, 0.09),
    total: 18,
    read: 0,
    page: 0,
    pages: 16,
    language: 'pl',
    groups: ['Nocna Biblioteka'],
    year: 2024,
    genres: ['Folk horror', 'Polish original'],
    fresh: 3,
    description:
      'A young witch inherits a forest in the Bieszczady mountains that keeps its own ledger of debts.',
    lastRead: null,
    addedDays: 12,
    webtoon: true,
  },
  {
    id: 7,
    key: 'ice',
    title: 'The Ice Garden',
    jp: '氷の庭',
    author: 'Sora Fujimoto',
    art: art('ice', 228, 0.07, { darkTitle: true }),
    total: 46,
    read: 0,
    page: 0,
    pages: 20,
    language: 'en',
    groups: ['Frost Notes'],
    year: 2018,
    genres: ['Fantasy', 'Shoujo'],
    fresh: 0,
    description: 'A gardener grows flowers that only bloom below zero.',
    lastRead: null,
    addedDays: 40,
    rtl: true,
  },
  {
    id: 8,
    key: 'lantern',
    title: 'Jade Lantern',
    jp: '翠の灯',
    author: 'Yuki Hanamura',
    art: art('lantern', 158, 0.12, { vertical: true, title: 'right' }),
    total: 39,
    read: 17,
    page: 6,
    pages: 20,
    language: 'en',
    groups: ['Paper Lantern Scans'],
    year: 2022,
    genres: ['Supernatural'],
    fresh: 0,
    description:
      'Lanterns in an old shrine town light themselves for people who are about to get lost.',
    lastRead: 21,
    addedDays: 120,
    rtl: true,
  },
  {
    id: 9,
    key: 'petal',
    title: 'Sakura Debug',
    jp: '桜デバッグ',
    author: 'Nao Kisaragi',
    art: art('petal', 356, 0.12, { title: 'bottom' }),
    total: 27,
    read: 0,
    page: 0,
    pages: 20,
    language: 'en',
    groups: ['Moonbeam TL'],
    year: 2023,
    genres: ['Comedy', 'Workplace'],
    fresh: 0,
    description: 'A junior developer, a legacy codebase and a very patient senior.',
    lastRead: null,
    addedDays: 5,
    rtl: true,
  },
  {
    id: 10,
    key: 'tide',
    title: 'Kuroshio Divers',
    jp: '黒潮ダイバーズ',
    author: 'Ren Asakawa',
    art: art('wave', 238, 0.12, { darkTitle: true }),
    total: 64,
    read: 64,
    page: 0,
    pages: 20,
    language: 'en',
    groups: ['Frost Notes'],
    year: 2021,
    genres: ['Sports', 'Drama'],
    fresh: 0,
    description: 'A freediving team in Shizuoka trains against a current that does not forgive.',
    lastRead: 33,
    addedDays: 500,
    rtl: true,
  },
  {
    id: 11,
    key: 'blade',
    title: 'Matsuri Ronin',
    jp: '祭浪人',
    author: 'Daichi Mori',
    art: art('blade', 80, 0.14, { vertical: true }),
    total: 112,
    read: 0,
    page: 0,
    pages: 20,
    language: 'en',
    groups: ['Hearth Team'],
    year: 2017,
    genres: ['Action', 'Historical'],
    fresh: 0,
    description: 'A swordsman without a master works festival security in Edo.',
    lastRead: null,
    addedDays: 60,
    rtl: true,
  },
  {
    id: 12,
    key: 'glass',
    title: 'Szklany Smok',
    jp: null,
    author: 'Michał Zawada',
    art: art('glass', 112, 0.12, { title: 'bottom' }),
    total: 9,
    read: 2,
    page: 11,
    pages: 18,
    language: 'pl',
    groups: ['Tłumacze z Piwnicy'],
    year: 2025,
    genres: ['Fantasy', 'Polish original'],
    fresh: 1,
    description: 'A glassblower from Krosno finds a dragon egg in the furnace ash.',
    lastRead: 6,
    addedDays: 30,
  },
];

const CHAPTER_TITLES = [
  'Lamp in the Window',
  'Margin Notes',
  'The Night Customer',
  'First Edition',
  'Rain over Kanazawa',
  'The Back Room Key',
  'The Last Shelf',
  'Tea at Three',
  'A Forgotten Author',
  'A Map Without Names',
  'Reading Room Silence',
  'Page Forty',
  'Lights Out',
  'The Second Note',
];

export const LINES_EN = [
  'The shop only opens at night.',
  'Who left this lamp on?',
  'Just one more chapter.',
  'Did you hear that?',
  'Do not go back alone.',
  'This is no ordinary map.',
  'You promised!',
  'I was waiting for you.',
  'Close the door.',
  'This book has no ending.',
  'Where did he go?',
  'Now I know.',
];

export const LINES_PL = [
  'Księgarnia jest otwarta tylko nocą.',
  'Kto zostawił tę lampę?',
  'Jeszcze jeden rozdział.',
  'Nie wracaj sam.',
  'Czekałam na ciebie.',
  'Zamknij drzwi.',
];

export function localById(id: number): LocalSeed | undefined {
  return LOCAL.find(s => s.id === id);
}

/** Cover hashes are the series key; `convertFileSrc` maps them back to the art. */
export function coverRef(seed: ArtSeries): CoverRef {
  const { h, c } = seed.art;
  const swatch = (l: number, k: number, dh = 0) => ({ l, c: c * k, h: (h + dh + 360) % 360 });
  return {
    hash: seed.key,
    path: `/demo/covers/${seed.key}.jpg`,
    width: 480,
    height: 720,
    palette: {
      h,
      c,
      swatches: [
        swatch(0.22, 0.6),
        swatch(0.46, 1),
        swatch(0.62, 1.1),
        swatch(0.7, 0.9, 30),
        swatch(0.9, 0.3),
      ],
      fallback: false,
    },
  };
}

export const chapterId = (seriesId: number, n: number) => seriesId * 1000 + n;

function chapterTitle(seed: LocalSeed, n: number): string {
  return CHAPTER_TITLES[(n * 5 + seed.key.length) % CHAPTER_TITLES.length] ?? 'Chapter';
}

/** The page count of a chapter: stable per chapter, around the series' usual length. */
function pageCount(seed: LocalSeed, n: number): number {
  return seed.pages + Math.floor(rng(`${seed.key}#${n}`)() * 4);
}

function chapters(seed: LocalSeed): ChapterEntry[] {
  const perVolume = seed.webtoon ? 0 : 8;
  return Array.from({ length: seed.total }, (_, i) => {
    const n = i + 1;
    const count = pageCount(seed, n);
    const done = n <= seed.read;
    const current = n === seed.read + 1 && seed.lastRead !== null && seed.read < seed.total;
    const at = seed.lastRead === null ? NOW : NOW - seed.lastRead * DAY - (seed.read - n) * DAY;
    return {
      id: chapterId(seed.id, n),
      path: `/demo/${seed.title}/${seed.title} - c${String(n).padStart(3, '0')}.cbz`,
      kind: 'zip' as const,
      title: chapterTitle(seed, n),
      volume: perVolume ? Math.ceil(n / perVolume) : null,
      number: n,
      pageCount: count,
      language: seed.language,
      scanGroup: seed.groups[0] ?? null,
      missing: false,
      error: null,
      progress: done
        ? {
            chapterId: chapterId(seed.id, n),
            page: count - 1,
            pageCount: count,
            completed: true,
            updatedAt: at,
          }
        : current
          ? {
              chapterId: chapterId(seed.id, n),
              page: seed.page,
              pageCount: count,
              completed: false,
              updatedAt: at,
            }
          : null,
    };
  });
}

export function summary(seed: LocalSeed): SeriesSummary {
  const started = seed.lastRead !== null;
  const finished = seed.read >= seed.total;
  return {
    id: seed.id,
    rootId: 1,
    title: seed.title,
    path: `/demo/${seed.title}`,
    cover: coverRef(seed),
    chapterCount: seed.total,
    missingCount: 0,
    completedCount: seed.read,
    lastReadAt: started ? NOW - (seed.lastRead ?? 0) * DAY : null,
    newCount: seed.fresh,
    continueChapterId: chapterId(
      seed.id,
      finished ? seed.total : Math.min(seed.read + 1, seed.total)
    ),
    missing: false,
    addedAt: NOW - seed.addedDays * DAY,
    updatedAt: NOW - Math.min(seed.addedDays, 3) * DAY,
  };
}

export function detail(seed: LocalSeed): SeriesDetail {
  return {
    ...summary(seed),
    description: seed.description,
    writer: seed.author,
    year: seed.year,
    language: seed.language,
    genres: seed.genres,
    manga: seed.rtl ? 'YesAndRightToLeft' : null,
    chapters: chapters(seed),
  };
}

export function chapterPages(seriesId: number, n: number): number {
  const seed = localById(seriesId);
  return seed ? pageCount(seed, n) : 20;
}

/* MangaDex: titles that live online only. */

export interface OnlineSeed extends ArtSeries {
  id: string;
  description: string;
  status: Manga['status'];
  demographic: Manga['demographic'];
  year: number;
  lastChapter: string;
  tags: string[];
  languages: string[];
  originalLanguage: string;
  artist?: string;
}

const uuid = (n: number) =>
  `d3m0${String(n).padStart(4, '0')}-6b1e-4c2a-9f00-0000000000${String(n).padStart(2, '0')}`;

export const ONLINE: OnlineSeed[] = [
  [
    'Paper Airplanes',
    '紙飛行機',
    'Kana Mizushima',
    art('sun', 220, 0.11),
    'Two pen pals fold their letters into planes and throw them across a river border.',
    'ongoing',
    'shoujo',
    2024,
    '38',
    ['Romance', 'Drama'],
  ],
  [
    'Night Train Seven',
    '夜行列車',
    'Shun Arakawa',
    art('moon', 250, 0.12, { vertical: true }),
    'A sleeper train that stops at stations missing from every map.',
    'ongoing',
    'seinen',
    2023,
    '52',
    ['Mystery', 'Supernatural'],
  ],
  [
    'Lighthouse Keeper',
    '灯台守',
    'Emi Takeda',
    art('wave', 205, 0.1, { darkTitle: true }),
    'The last keeper of an automated lighthouse refuses to leave.',
    'completed',
    'josei',
    2020,
    '44',
    ['Slice of life', 'Drama'],
  ],
  [
    'Letters on the Wind',
    '風の手紙',
    'Haru Nishino',
    art('petal', 330, 0.11, { title: 'bottom' }),
    'A postwoman delivers letters to people who have not written them yet.',
    'ongoing',
    'shoujo',
    2025,
    '19',
    ['Fantasy', 'Romance'],
  ],
  [
    'Whale Song',
    '鯨の歌',
    'Riku Hoshino',
    art('orbit', 210, 0.12, { title: 'bottom' }),
    'A deep sea research crew hears a song no whale should know.',
    'ongoing',
    'seinen',
    2022,
    '61',
    ['Sci-fi', 'Mystery'],
  ],
  [
    'Fox Wedding',
    '狐の嫁入り',
    'Mai Kanzaki',
    art('lantern', 32, 0.15, { vertical: true }),
    'Rain on a sunny day means a fox is getting married, and this time she invited a human.',
    'completed',
    'shoujo',
    2019,
    '27',
    ['Supernatural', 'Romance'],
  ],
  [
    'Goldfish Summer',
    '金魚',
    'Toru Ibuki',
    art('ember', 18, 0.16, { vertical: true }),
    'A festival goldfish grants one wish per summer, if you can keep it alive.',
    'ongoing',
    'shounen',
    2024,
    '23',
    ['Comedy', 'Slice of life'],
  ],
  [
    'Sky Blue Notebook',
    '空色ノート',
    'Chika Aoyama',
    art('glass', 235, 0.1, { title: 'bottom' }),
    'Everything written in the notebook comes true by the next rainfall.',
    'hiatus',
    'shoujo',
    2021,
    '33',
    ['Drama', 'Supernatural'],
  ],
  [
    'Falling Stars',
    '星降る',
    'Kenji Morioka',
    art('forest', 180, 0.1),
    'A boy collects fallen stars in a jar and has to give them back.',
    'ongoing',
    'shounen',
    2023,
    '47',
    ['Adventure', 'Fantasy'],
  ],
  [
    'The Rain Shelter',
    '雨宿り',
    'Yui Sakamoto',
    art('ice', 255, 0.08, { darkTitle: true }),
    'Strangers wait out a storm under the same bus stop roof every Tuesday.',
    'completed',
    'josei',
    2018,
    '12',
    ['Slice of life', 'Romance'],
  ],
  [
    'Library of Hours',
    '図書館',
    'Ayame Kudo',
    art('archive', 50, 0.13, { title: 'bottom' }),
    'Borrow a book, lose an hour. Return it late and lose a day.',
    'ongoing',
    'seinen',
    2025,
    '15',
    ['Fantasy', 'Mystery'],
  ],
  [
    'Iron Petal',
    '鉄の花',
    'Gen Takahashi',
    art('blade', 0, 0.15, { vertical: true }),
    'A blacksmith forges swords that bloom when they are drawn.',
    'ongoing',
    'shounen',
    2022,
    '88',
    ['Action', 'Historical'],
  ],
].map(
  ([title, jp, author, cover, description, status, demographic, year, lastChapter, tags], i) => ({
    id: uuid(i + 1),
    key: `online-${i + 1}`,
    title: title as string,
    jp: jp as string,
    author: author as string,
    art: cover as CoverArt,
    description: description as string,
    status: status as Manga['status'],
    demographic: demographic as Manga['demographic'],
    year: year as number,
    lastChapter: lastChapter as string,
    tags: tags as string[],
    languages: ['en', 'pl', 'es-la', 'fr'].slice(0, 2 + (i % 3)),
    originalLanguage: 'ja',
  })
);

/** Every demo series, local and online, whose cover the art draws up front. */
export const ALL_SERIES: ArtSeries[] = [...LOCAL, ...ONLINE];

export function onlineById(id: string): OnlineSeed | undefined {
  return ONLINE.find(s => s.id === id);
}

const TAG_GROUPS: Record<string, OnlineTag['group']> = {
  Romance: 'genre',
  Drama: 'genre',
  Mystery: 'genre',
  Supernatural: 'theme',
  'Slice of life': 'genre',
  Fantasy: 'genre',
  'Sci-fi': 'genre',
  Comedy: 'genre',
  Adventure: 'genre',
  Action: 'genre',
  Historical: 'genre',
};

export const ONLINE_TAGS: OnlineTag[] = Object.entries(TAG_GROUPS).map(([name, group], i) => ({
  id: `7a9c${String(i).padStart(4, '0')}-0000-4000-8000-000000000000`,
  name: { en: name },
  group,
}));

const tagByName = (name: string) => ONLINE_TAGS.find(t => t.name.en === name);

export function manga(seed: OnlineSeed): Manga {
  return {
    id: seed.id,
    title: { en: seed.title },
    altTitles: [{ ja: seed.jp ?? seed.title }],
    description: { en: seed.description },
    originalLanguage: seed.originalLanguage,
    status: seed.status,
    demographic: seed.demographic,
    contentRating: 'safe',
    year: seed.year,
    lastVolume: null,
    lastChapter: seed.lastChapter,
    tags: seed.tags.flatMap(name => tagByName(name) ?? []),
    availableLanguages: seed.languages,
    chapterNumbersResetOnNewVolume: false,
    links: {},
    cover: { id: `${seed.id}-cover`, fileName: `${seed.key}.jpg`, volume: '1', locale: 'ja' },
    authors: [{ id: `${seed.id}-a`, name: seed.author }],
    artists: [{ id: `${seed.id}-b`, name: seed.artist ?? seed.author }],
    updatedAt: new Date(NOW - 3 * HOUR).toISOString(),
  };
}

const ONLINE_GROUPS = [
  { id: 'g-1', name: 'Paper Lantern Scans', website: null, official: false },
  { id: 'g-2', name: 'Nocna Biblioteka', website: null, official: false },
  { id: 'g-3', name: 'Moonbeam TL', website: null, official: false },
];

export function onlineChapters(seed: OnlineSeed): Chapter[] {
  const last = Number(seed.lastChapter);
  const out: Chapter[] = [];
  for (let n = last; n >= Math.max(1, last - 23); n--) {
    for (const language of ['en', 'pl']) {
      if (language === 'pl' && n % 3 === 0) continue;
      const group = language === 'pl' ? ONLINE_GROUPS[1] : ONLINE_GROUPS[n % 2 === 0 ? 0 : 2];
      const published = new Date(NOW - (last - n) * 6 * DAY - 5 * HOUR).toISOString();
      out.push({
        id: `${seed.id}-c${n}-${language}`,
        mangaId: seed.id,
        title: CHAPTER_TITLES[(n * 5) % CHAPTER_TITLES.length] ?? null,
        volume: String(Math.ceil(n / 8)),
        chapter: String(n),
        pages: 18 + (n % 6),
        language,
        externalUrl: null,
        publishAt: published,
        readableAt: published,
        updatedAt: published,
        groups: group ? [group] : [],
        uploader: { id: 'u-1', username: 'kirei-demo' },
      });
    }
  }
  return out;
}

/* Shelf: collections, tags, Want to Read and smart filters. */

const item = (seriesId: number, addedDaysAgo: number, refId: number): ShelfItem => {
  const seed = localById(seriesId);
  return {
    refId,
    seriesId,
    source: 'local',
    remoteId: null,
    title: seed?.title ?? '',
    coverFile: null,
    addedAt: NOW - addedDaysAgo * DAY,
  };
};

const remoteItem = (index: number, addedDaysAgo: number, refId: number): ShelfItem => {
  const seed = ONLINE[index];
  return {
    refId,
    seriesId: null,
    source: 'mangadex',
    remoteId: seed?.id ?? null,
    title: seed?.title ?? '',
    coverFile: seed ? `${seed.key}.jpg` : null,
    addedAt: NOW - addedDaysAgo * DAY,
  };
};

export const COLLECTION_ITEMS: Record<number, ShelfItem[]> = {
  1: [item(1, 40, 101), item(4, 30, 104), item(8, 20, 108), item(7, 10, 107)],
  2: [item(6, 9, 106), item(12, 8, 112)],
  3: [item(3, 60, 103), item(11, 50, 111), item(2, 45, 102), remoteItem(11, 5, 211)],
  4: [item(5, 120, 105), item(10, 90, 110)],
};

const COLLECTION_NAMES: [number, string][] = [
  [1, 'Rainy evenings'],
  [2, 'Polish originals'],
  [3, 'Action nights'],
  [4, 'Finished and loved'],
];

export const COLLECTIONS: Collection[] = COLLECTION_NAMES.map(([id, name], position) => {
  const items = COLLECTION_ITEMS[id] ?? [];
  return {
    id,
    name,
    position,
    count: items.length,
    coverRefId: items[0]?.refId ?? null,
    preview: items.slice(0, 4),
    updatedAt: NOW - (position + 1) * DAY,
  };
});

export const WANT: ShelfItem[] = [
  item(9, 2, 109),
  remoteItem(0, 3, 201),
  item(11, 4, 111),
  remoteItem(4, 5, 205),
  item(7, 6, 107),
  remoteItem(5, 8, 206),
  remoteItem(8, 11, 209),
];

export const TAGS: Tag[] = [
  { id: 1, name: 'favourite', count: 4 },
  { id: 2, name: 'cosy', count: 3 },
  { id: 3, name: 'reread', count: 2 },
  { id: 4, name: 'gorgeous art', count: 5 },
  { id: 5, name: 'slow burn', count: 2 },
];

/** Tag ids per local series. */
export const SERIES_TAGS: Record<number, number[]> = {
  1: [1, 2, 4],
  2: [4],
  3: [1, 4],
  4: [2, 5],
  5: [3, 5],
  8: [2, 4],
  10: [1, 3],
  12: [4],
};

const query = (patch: Partial<FilterQuery>): FilterQuery => ({ ...EMPTY_QUERY, ...patch });

export const FILTERS: SmartFilter[] = [
  {
    id: 1,
    name: 'New chapters waiting',
    query: query({ minUnread: 1, status: ['reading'], sort: 'unread' }),
    pinned: true,
    position: 0,
    updatedAt: NOW - 4 * DAY,
  },
  {
    id: 2,
    name: 'Short and finished',
    query: query({ status: ['finished'], sort: 'title' }),
    pinned: false,
    position: 1,
    updatedAt: NOW - 8 * DAY,
  },
  {
    id: 3,
    name: 'Added this month',
    query: query({ addedWithinDays: 30, sort: 'added' }),
    pinned: true,
    position: 2,
    updatedAt: NOW - 12 * DAY,
  },
];

/** The series each smart filter matches, in its sort order. */
export const FILTER_RESULTS: Record<number, number[]> = {
  1: [3, 1, 4, 12],
  2: [5, 10],
  3: [9, 6, 12],
};

export function filterItems(id: number): ShelfItem[] {
  return (FILTER_RESULTS[id] ?? []).map(seriesId => ({
    ...item(seriesId, localById(seriesId)?.addedDays ?? 0, 0),
    refId: null,
  }));
}

export const OVERVIEW: ShelfOverview = {
  wantCount: WANT.length,
  collections: COLLECTIONS,
  tags: TAGS,
  filters: FILTERS,
};

/* Reading stats for the year so far. */

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function readingStats(year: number): ReadingStats {
  const r = rng(`stats-${year}`);
  const start = Date.UTC(year, 0, 1);
  const today = Math.floor(NOW / DAY) * DAY;
  const days: ReadingDay[] = [];
  const months = Array.from({ length: 12 }, () => 0);
  for (let t = start; t <= today && new Date(t).getUTCFullYear() === year; t += DAY) {
    const age = (today - t) / DAY;
    // A steady habit with quiet weeks, busier on weekends, every day of the last fortnight.
    const weekday = new Date(t).getUTCDay();
    const chance = age < 15 ? 1 : weekday === 0 || weekday === 6 ? 0.82 : 0.5;
    if (r() > chance) continue;
    const activeMs = Math.round((12 + r() * (weekday % 6 === 0 ? 80 : 45)) * 60_000);
    const pagesTurned = Math.round((activeMs / 60_000) * (2.4 + r()));
    const day: ReadingDay = {
      date: isoDay(t),
      activeMs,
      pagesTurned,
      chaptersFinished: Math.max(1, Math.round(pagesTurned / 21)),
      sessions: 1 + Math.floor(r() * 3),
    };
    days.push(day);
    const month = new Date(t).getUTCMonth();
    months[month] = (months[month] ?? 0) + activeMs;
  }
  const totals = (list: ReadingDay[], seriesRead: number): ReadingTotals => ({
    activeMs: list.reduce((s, d) => s + d.activeMs, 0),
    sessions: list.reduce((s, d) => s + d.sessions, 0),
    pagesTurned: list.reduce((s, d) => s + d.pagesTurned, 0),
    chaptersFinished: list.reduce((s, d) => s + d.chaptersFinished, 0),
    daysRead: list.length,
    seriesRead,
  });
  const yearTotals = totals(days, 9);
  const share = [0.27, 0.21, 0.16, 0.12, 0.09, 0.07];
  const topIds = [1, 3, 2, 5, 10, 8];
  const topSeries: SeriesReading[] = topIds.map((id, i) => {
    const seed = localById(id);
    const portion = share[i] ?? 0.05;
    return {
      seriesId: id,
      title: seed?.title ?? '',
      cover: seed ? coverRef(seed) : null,
      activeMs: Math.round(yearTotals.activeMs * portion),
      pagesTurned: Math.round(yearTotals.pagesTurned * portion),
      chaptersFinished: Math.round(yearTotals.chaptersFinished * portion),
      sessions: Math.round(yearTotals.sessions * portion),
      daysRead: Math.round(yearTotals.daysRead * portion * 1.6),
    };
  });
  const allTime = {
    ...yearTotals,
    activeMs: Math.round(yearTotals.activeMs * 1.7),
    sessions: Math.round(yearTotals.sessions * 1.7),
    pagesTurned: Math.round(yearTotals.pagesTurned * 1.7),
    chaptersFinished: Math.round(yearTotals.chaptersFinished * 1.7),
    daysRead: Math.round(yearTotals.daysRead * 1.65),
    seriesRead: 11,
  };
  const streakStart = isoDay(today - 14 * DAY);
  return {
    year,
    today: isoDay(today),
    years: [year, year - 1],
    allTime,
    yearTotals,
    currentStreak: { days: 15, start: streakStart, end: isoDay(today) },
    longestStreak: { days: 23, start: `${year - 1}-12-18`, end: `${year}-01-09` },
    yearLongestStreak: { days: 19, start: `${year}-07-02`, end: `${year}-07-20` },
    days,
    months,
    topSeries,
    longestSessionMs: Math.round(2.6 * HOUR),
  };
}
